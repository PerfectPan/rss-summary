import { newsPublicationRange } from "../domain/news-time.js";
import {
  buildNewsStoriesWithAudit,
  type NewsSearchHit,
  type NewsTimeWindow,
  type NewsTopic,
  type NewsTopicQuery,
} from "../domain/news.js";
import { canonicalizeUrl } from "../domain/text.js";
import {
  DoubaoSearchError,
  type DoubaoSearchInput,
  type DoubaoSearchPage,
} from "../infrastructure/doubao-search.js";
import type {
  GlmResearchClient,
  ResearchPage,
  ResearchSearchResult,
} from "../infrastructure/glm-research.js";

export type NewsSearchRequest = {
  input: DoubaoSearchInput;
  query: NewsTopicQuery;
  topic: NewsTopic;
};

type Options = {
  search: (input: DoubaoSearchInput) => Promise<DoubaoSearchPage>;
  glm: Pick<GlmResearchClient, "search" | "read">;
  window: NewsTimeWindow;
  maxSearches: number;
  maxReads: number;
  queryIds?: string[];
  rotation?: number;
  combine?: boolean;
  recency?: "noLimit" | "oneWeek";
};

/** A brief owns its quota circuit and cache. Reserve budgets before any provider runs. */
export function createHybridNewsSearch(options: Options) {
  let quotaExhausted = false;
  let searches = 0;
  let reads = 0;
  const pages = new Map<string, Promise<ResearchPage>>();
  const rotation = Math.max(0, options.rotation ?? 0);
  const share = (budget: number, id: string) => {
    const ids = options.queryIds;
    if (!ids?.length) return budget;
    const index = ids.indexOf(id);
    if (index < 0) return 0;
    const priority = (index - (rotation % ids.length) + ids.length) % ids.length;
    return Math.floor(budget / ids.length) + (priority < budget % ids.length ? 1 : 0);
  };

  return async (request: NewsSearchRequest): Promise<DoubaoSearchPage> => {
    let primary: DoubaoSearchPage | undefined;
    let primaryError: DoubaoSearchError | undefined;
    try {
      if (quotaExhausted)
        throw new DoubaoSearchError("10406", "Free quota exhausted in this brief run.");
      primary = await options.search(request.input);
    } catch (error) {
      if (!(error instanceof DoubaoSearchError)) throw error;
      primaryError = error;
      if (error.code === "10406") quotaExhausted = true;
    }
    const baseline = primary?.results ?? [];
    const accepted = buildNewsStoriesWithAudit(
      baseline.map((result) => toHit(result, request)),
      options.window,
    ).stories;
    if (accepted.length > 0 && !options.combine) return { ...primary!, provider: "doubao" };

    const fallback = {
      reason: primaryError?.code ?? (accepted.length ? "complement" : "no-eligible-results"),
      searched: false,
      searches: 0,
      reads: 0,
      incomplete: false,
      sources: [] as string[],
      skippedSources: [] as string[],
      warnings: [] as string[],
      rawResults: 0,
      domainRejected: 0,
      invalidLinks: 0,
    };
    const result: DoubaoSearchPage = {
      ...primary,
      provider: primary ? "mixed" : "glm",
      fallback,
      resultCount: baseline.length,
      results: [...baseline],
    };
    const config = request.query.glm;
    if (!config) {
      if (primaryError) throw primaryError;
      fallback.incomplete = true;
      fallback.warnings.push("未配置 GLM 可信来源");
      return result;
    }
    const searchLimit = Math.min(
      share(options.maxSearches, request.query.id),
      options.maxSearches - searches,
    );
    const readLimit = share(options.maxReads, request.query.id);
    const offset = rotation % config.domains.length;
    const domains = [...config.domains.slice(offset), ...config.domains.slice(0, offset)];
    const targets = domains.slice(0, searchLimit);
    fallback.skippedSources = domains.slice(searchLimit);
    if (fallback.skippedSources.length) {
      fallback.incomplete = targets.length === 0;
      fallback.warnings.push("GLM 搜索预算已用完");
    }
    if (!targets.length && primaryError)
      throw new DoubaoSearchError("search_budget", "Fallback search budget unavailable.");
    let completed = 0;
    const sourceResults: ResearchSearchResult[][] = [];
    // Each call has one source constraint; rotate sources within the reserved query budget.
    for (const domain of targets) {
      searches++;
      fallback.searches++;
      fallback.searched = true;
      fallback.sources.push(domain);
      try {
        const found = await options.glm.search(
          config.sourceQueries?.[domain] ?? config.query,
          request.topic.sourcePolicy === "news" ? [] : [domain],
          options.recency ?? "oneWeek",
          (counts) => {
            fallback.rawResults += counts.rawResults;
            fallback.domainRejected += counts.domainRejected;
          },
          domain.endsWith(".cn") ? "cn" : "us",
        );
        sourceResults.push(found);
        completed++;
      } catch {
        fallback.incomplete = true;
        fallback.warnings.push("GLM 搜索不可用，保留原搜索结果");
      }
    }
    if (!completed && primaryError)
      throw new DoubaoSearchError(
        "hybrid_unavailable",
        `Primary ${primaryError.code}; GLM search unavailable.`,
      );
    const seen = new Set<string>();
    const candidates = Array.from({ length: request.input.count }, (_, rank) =>
      sourceResults.flatMap((items) => (items[rank] ? [items[rank]!] : [])),
    ).flat();
    for (const candidate of candidates.slice(0, request.input.count)) {
      const url = canonicalizeUrl(candidate.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const parsed = new URL(url);
      const domain = config.domains.find(
        (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
      );
      if (
        (!domain && request.topic.sourcePolicy !== "news") ||
        !["https:", "http:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password
      ) {
        fallback.invalidLinks++;
        fallback.warnings.push("GLM 候选不符合来源策略或 HTTP(S) 地址要求，已丢弃");
        continue;
      }
      let pending = pages.get(url);
      if (!pending) {
        if (reads >= options.maxReads || fallback.reads >= readLimit) {
          fallback.incomplete = true;
          fallback.warnings.push("GLM 原文读取预算已用完");
          break;
        }
        reads++;
        fallback.reads++;
        pending = options.glm.read(url);
        pages.set(url, pending);
      }
      let article: ResearchPage;
      try {
        article = await pending;
      } catch {
        fallback.incomplete = true;
        fallback.warnings.push("GLM 原文读取失败，未采用该候选");
        continue;
      }
      if (
        canonicalizeUrl(article.url) !== url ||
        !article.title.trim() ||
        !article.content.trim() ||
        !article.publishedAt
      ) {
        fallback.warnings.push("GLM 原文缺少可验证的发布时间、正文或链接，未采用该候选");
        continue;
      }
      const publication = newsPublicationRange(article.publishedAt, options.window.timezoneOffset);
      if (
        !publication ||
        publication.since < options.window.since ||
        publication.until > options.window.until
      ) {
        fallback.warnings.push("GLM 原文不在本期时间窗口或日期精度不足，未采用该候选");
        continue;
      }
      result.results.push({
        id: `glm:${url}`,
        title: article.title,
        url,
        summary: article.content.slice(0, 3000),
        publishTime: article.publishedAt,
        siteName: parsed.hostname,
        rankPosition: result.results.length + 1,
        sourceVerification: {
          method: domain ? "configured-domain" : "article-read",
          domain: domain ?? parsed.hostname,
          policy: domain ? "official" : "news",
        },
        authInfoDescription: domain
          ? "优先参考来源 · 原文发布时间已校验"
          : "原文已读取 · 来源可信度未评级",
      });
    }
    if (
      (fallback.invalidLinks > 0 && result.results.length === baseline.length) ||
      (fallback.rawResults > 0 && fallback.domainRejected === fallback.rawResults)
    ) {
      fallback.incomplete = true;
      fallback.warnings.push("搜索结果无法提供可核验的文章链接");
    }
    fallback.warnings = [...new Set(fallback.warnings)];
    result.resultCount = result.results.length;
    return result;
  };
}

function toHit(
  result: DoubaoSearchPage["results"][number],
  { query, topic }: NewsSearchRequest,
): NewsSearchHit {
  return {
    ...result,
    topicId: topic.id,
    topicLabel: topic.label,
    sourcePolicy: topic.sourcePolicy,
    queryId: query.id,
    queryText: query.text,
    subjectAny: query.subjectAny,
    eventAny: query.eventAny,
    excludedAny: query.excludedAny,
  };
}

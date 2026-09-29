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
import type { GlmResearchClient, ResearchPage } from "../infrastructure/glm-research.js";

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
};

/** One sequential brief run owns the quota circuit, Reader cache and fallback budgets. */
export function createHybridNewsSearch(
  options: Options,
): (request: NewsSearchRequest) => Promise<DoubaoSearchPage> {
  let quotaExhausted = false;
  let searches = 0;
  let reads = 0;
  const pages = new Map<string, Promise<ResearchPage>>();

  return async (request) => {
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
    if (accepted.length > 0) return { ...primary!, provider: "doubao" };

    const fallback = {
      reason: primaryError?.code ?? "no-eligible-results",
      searched: false,
      reads: 0,
      warnings: [] as string[],
    };
    const page = (): DoubaoSearchPage => ({
      ...primary,
      provider: primary ? "mixed" : "glm",
      fallback,
      resultCount: baseline.length,
      results: [...baseline],
    });
    if (!request.query.glm || searches >= options.maxSearches) {
      if (primaryError) throw primaryError;
      fallback.warnings.push(request.query.glm ? "GLM 搜索预算已用完" : "未配置 GLM 可信来源");
      return page();
    }
    const result = page();
    const { query, domains } = request.query.glm;
    searches++;
    fallback.searched = true;
    let candidates;
    try {
      candidates = await options.glm.search(query, domains, "oneDay");
    } catch {
      if (primaryError)
        throw new DoubaoSearchError(
          "hybrid_unavailable",
          `Primary ${primaryError.code}; GLM search unavailable.`,
        );
      fallback.warnings.push("GLM 搜索不可用，保留原搜索结果");
      return result;
    }
    const seen = new Set<string>();
    for (const candidate of candidates.slice(0, request.input.count)) {
      const url = canonicalizeUrl(candidate.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const parsed = new URL(url);
      const domain = domains.find(
        (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
      );
      if (
        !domain ||
        !["https:", "http:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        parsed.port ||
        parsed.pathname === "/" ||
        /\/(?:feed|rss|category|tag)(?:\/|$)/iu.test(parsed.pathname)
      ) {
        fallback.warnings.push("GLM 候选不是可信文章链接，已丢弃");
        continue;
      }
      let pending = pages.get(url);
      if (!pending) {
        if (reads >= options.maxReads) {
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
        fallback.warnings.push("GLM 原文读取失败，未采用该候选");
        continue;
      }
      // Reader must attest the selected page, not a same-site landing page reached by redirect.
      if (
        canonicalizeUrl(article.url) !== url ||
        !article.title.trim() ||
        !article.content.trim() ||
        !article.publishedAt
      ) {
        fallback.warnings.push("GLM 原文缺少可验证的发布时间、正文或链接，未采用该候选");
        continue;
      }
      const publishedAt = Date.parse(article.publishedAt);
      if (
        !Number.isFinite(publishedAt) ||
        publishedAt < options.window.since ||
        publishedAt >= options.window.until
      ) {
        fallback.warnings.push("GLM 原文不在本期时间窗口，未采用该候选");
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
          method: "configured-domain",
          domain,
          policy: request.topic.sourcePolicy,
        },
        authInfoDescription: "配置的可信来源 · 原文发布时间已校验",
      });
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

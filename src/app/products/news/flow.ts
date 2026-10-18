import { Effect } from "effect";
import { runPluginEffect } from "../../runtime.js";
import { canonicalizeUrl } from "../../../kernel/index.js";

import {
  buildNewsStoriesWithAudit,
  projectNewsHit,
  selectNewsStoriesWithAudit,
  type NewsBriefEdition,
  type SelectedNewsStory,
} from "../../../editorial/index.js";
import {
  buildNewsAudit,
  summarizeNewsSources,
  type NewsBriefAudit,
  type NewsSourceStatus,
  type NewsTopic,
} from "./output.js";
import {
  calendarDayAtOffset,
  parseOffsetMilliseconds,
  startOfCalendarDay,
} from "../../../kernel/index.js";
import { boundedInteger } from "../../config/parse.js";
import { loadNewsTopics } from "./topics.js";
import { createGlmResearch, type GlmResearch } from "./hybrid.js";
import {
  createBudgetedNewsSearch,
  DoubaoSearchClient,
  editionRotation,
  GrokSearchClient,
  isSearchFailure,
  NewsSearchError,
  resolveNewsCredibility,
  retrySearchEffect,
  searchBudgetDefaults,
  selectQueryIds,
  settleSearches,
  type NewsSearchInput,
  type NewsSearchPage,
} from "../../../acquisition/index.js";
import { createHybridNewsSearch } from "./hybrid.js";

export type { NewsBriefEdition };

export type RivusNewsBriefInput = {
  occurrence: string;
  edition: NewsBriefEdition;
  since?: string;
  reportedUrls?: string[];
};

/** Application result: pure document fields. Presentation adds `markdown`. */
export type RivusNewsBriefResult = {
  audit: NewsBriefAudit;
  day: string;
  edition: NewsBriefEdition;
  generatedAt: string;
  itemCount: number;
  warnings: string[];
  sourceStatus?: NewsSourceStatus;
  windowLabel: string;
  stories: SelectedNewsStory[];
  topics: NewsTopic[];
};

/** Tool shape after presentation renders Markdown. */
export type RivusNewsBriefOutput = RivusNewsBriefResult & { markdown: string };

/**
 * Every configured query failed because of provider or network availability.
 * Standalone news briefs still fail; aggregate products may safely degrade by
 * consuming the attached empty result and its complete per-query audit.
 */
export class AllNewsQueriesFailedError extends Error {
  readonly result: RivusNewsBriefResult;

  constructor(result: RivusNewsBriefResult) {
    const grokFailures = result.audit.queries.filter(({ errorCode }) =>
      errorCode?.startsWith("grok_"),
    );
    const reasons: Record<string, string> = {
      grok_timeout: "Grok 搜索超时",
      grok_call_limit: "Grok 持续追加搜索，已终止本次请求",
      grok_output_limit: "Grok 输出超过限制",
      grok_not_found: "未找到 Grok CLI",
      grok_invalid_response: "Grok 未返回完整、可验证的搜索结果",
      grok_source_policy: "Grok 不支持当前来源要求",
    };
    super(
      grokFailures.length
        ? `新闻搜索未完成：${[...new Set(grokFailures.map(({ errorCode }) => reasons[errorCode!] ?? "Grok 调用失败"))].join("；")}。本次未生成新闻简报。`
        : "All news search queries failed.",
    );
    this.name = "AllNewsQueriesFailedError";
    this.result = result;
  }
}

type NewsBriefDependencies = {
  maxQueries?: number;
  glm?: GlmResearch;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  random?: () => number;
  search?: (input: NewsSearchInput) => Promise<NewsSearchPage>;
  sleep?: (milliseconds: number) => Promise<void>;
  topics?: NewsTopic[];
};

const noonCutoffMinutes = 12 * 60 + 30;
const newsSearchConcurrency = 2;

export function resolveNewsEditionWindow(
  occurrence: string,
  timezoneOffset: string,
  edition: NewsBriefEdition,
): { day: string; since: number; until: number; label: string; timezoneOffset: string } {
  const until = Date.parse(occurrence);
  if (!Number.isFinite(until)) throw new Error("occurrence must be a valid date-time.");
  const day = calendarDayAtOffset(occurrence, timezoneOffset);
  const dayStart = startOfCalendarDay(day, timezoneOffset);
  const noonCutoff = dayStart + noonCutoffMinutes * 60_000;
  const since = edition === "noon" ? dayStart : noonCutoff;
  const windowEnd = edition === "noon" ? Math.min(until, noonCutoff) : until;
  if (windowEnd <= since)
    throw new Error(`${edition} news occurrence is earlier than its delivery window.`);
  return {
    day,
    since,
    until: windowEnd,
    label: `${edition === "noon" ? "00:00" : "12:30"}–${timeAtOffset(windowEnd, timezoneOffset)}`,
    timezoneOffset,
  };
}

export function generateRivusNewsBrief(
  value: unknown,
  dependencies: NewsBriefDependencies = {},
): Effect.Effect<RivusNewsBriefResult, Error> {
  return Effect.gen(function* () {
    const input = yield* Effect.try({
      try: () => parseInput(value),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
    const env = dependencies.env ?? process.env;
    const timezoneOffset = env.FEED_TIMEZONE_OFFSET ?? "+08:00";
    const window = yield* Effect.try({
      try: () => {
        return {
          ...(input.since
            ? {
                day: calendarDayAtOffset(input.occurrence, timezoneOffset),
                since: Date.parse(input.since),
                until: Date.parse(input.occurrence),
                label: `${input.since}–${input.occurrence}（补采）`,
                timezoneOffset,
              }
            : resolveNewsEditionWindow(input.occurrence, timezoneOffset, input.edition)),
          reportedUrls: input.reportedUrls,
        };
      },
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
    const rotation = editionRotation(window.day, input.edition);
    const topics = (dependencies.topics ?? loadNewsTopics(env.NEWS_TOPICS_FILE)).filter(
      ({ enabled }) => enabled,
    );
    if (topics.length === 0) {
      return yield* Effect.fail(new Error("At least one news topic must be enabled."));
    }
    const mode = env.NEWS_SEARCH_MODE ?? "grok";
    if (!["doubao", "hybrid", "combined", "grok"].includes(mode)) {
      return yield* Effect.fail(
        new Error("NEWS_SEARCH_MODE must be doubao, hybrid, combined or grok."),
      );
    }
    const count = boundedInteger(env.NEWS_SEARCH_COUNT_PER_QUERY, 10, 1, 50);
    const managedSearch = yield* Effect.try({
      try: () => (dependencies.search ? undefined : createSearch(env, mode, dependencies.now)),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
    const requests = topics.flatMap((topic) =>
      topic.queries.map((query) => ({
        query,
        topic,
        input: {
          query:
            mode !== "grok" && query.glm?.sourceQueries
              ? (query.glm.sourceQueries[query.glm.domains[rotation % query.glm.domains.length]!] ??
                query.text)
              : query.text,
          count,
          day: window.day,
          sinceDay: calendarDayAtOffset(new Date(window.since).toISOString(), timezoneOffset),
          sourcePolicy: topic.sourcePolicy,
          ...(mode === "grok"
            ? {
                window: {
                  since: new Date(window.since).toISOString(),
                  until: new Date(window.until).toISOString(),
                },
              }
            : {}),
        },
      })),
    );
    const requestedMaxQueries = yield* Effect.try({
      try: () =>
        boundedInteger(
          dependencies.maxQueries === undefined
            ? env.NEWS_SEARCH_MAX_QUERIES
            : String(dependencies.maxQueries),
          4,
          1,
          32,
        ),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
    const maxQueries =
      mode === "grok"
        ? Math.min(requestedMaxQueries, boundedInteger(env.NEWS_GROK_MAX_QUERIES, 1, 1, 4))
        : requestedMaxQueries;
    const selectedQueryIds = selectQueryIds(
      requests.map((request) => request.query.id),
      rotation,
      maxQueries,
    );
    const searchEffect = (input: NewsSearchInput): Effect.Effect<NewsSearchPage, unknown> =>
      dependencies.search
        ? Effect.tryPromise({
            try: () => dependencies.search!(input),
            catch: (reason) => reason,
          })
        : managedSearch!(input);
    const primarySearch = (input: NewsSearchInput) =>
      retrySearchEffect(searchEffect(input), {
        random: dependencies.random ?? Math.random,
        sleep: dependencies.sleep ?? sleep,
      });
    const execute = yield* Effect.try({
      try: () =>
        mode === "hybrid" || mode === "combined"
          ? createHybridNewsSearch({
              search: (input) => runPluginEffect(primarySearch(input)),
              ...(managedSearch
                ? {
                    cachedSearch: (input: NewsSearchInput) =>
                      runPluginEffect(managedSearch.cachedSearch(input)),
                  }
                : {}),
              glm: dependencies.glm ?? createGlmResearch({ apiKey: env.GLM_CODING_API_KEY ?? "" }),
              window,
              maxSearches: boundedInteger(env.NEWS_GLM_MAX_SEARCHES, 14, 1, 64),
              queryIds: requests
                .filter(({ query }) => selectedQueryIds.has(query.id))
                .map(({ query }) => query.id),
              rotation,
              combine: mode === "combined",
              recency:
                (dependencies.now?.() ?? new Date()).getTime() - window.since > 7 * 86_400_000
                  ? "noLimit"
                  : "oneWeek",
              maxReads: boundedInteger(env.NEWS_GLM_MAX_READS, 14, 1, 64),
            })
          : undefined,
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
    const settled = yield* settleSearches(
      requests,
      (request) => {
        if (!selectedQueryIds.has(request.query.id)) {
          return Effect.fail(
            new NewsSearchError("query_deferred", "Query deferred by the per-run search limit."),
          );
        }
        return execute
          ? Effect.tryPromise({ try: () => execute(request), catch: (reason) => reason })
          : primarySearch(request.input);
      },
      mode !== "doubao" ? 1 : newsSearchConcurrency,
    );
    const successful = settled.filter((result) => result._tag === "Fulfilled");
    const { sourceStatus, warnings } = summarizeNewsSources(requests, settled);
    const generatedAt = (dependencies.now ?? (() => new Date()))().toISOString();
    if (successful.length === 0) {
      const failures = settled.flatMap((result) =>
        result._tag === "Rejected" ? [result.reason] : [],
      );
      if (!failures.every((error) => isSearchFailure(error))) {
        return yield* Effect.fail(new AggregateError(failures, "All news search queries failed."));
      }
      const unavailable: RivusNewsBriefResult = {
        audit: buildNewsAudit(requests, settled, [], [], 0, 0),
        day: window.day,
        edition: input.edition,
        generatedAt,
        itemCount: 0,
        warnings,
        sourceStatus,
        windowLabel: window.label,
        stories: [],
        topics,
      };
      if (
        failures.every(
          (error) =>
            isSearchFailure(error) &&
            ["local_budget_exhausted", "query_deferred"].includes(error.code),
        )
      )
        return unavailable;
      return yield* Effect.fail(new AllNewsQueriesFailedError(unavailable));
    }

    const hits = settled.flatMap((result, index) => {
      if (result._tag !== "Fulfilled") return [];
      const request = requests[index]!;
      return result.value.results.map((searchResult) =>
        projectNewsHit(
          searchResult,
          {
            topicId: request.topic.id,
            topicLabel: request.topic.label,
            sourcePolicy: request.topic.sourcePolicy,
            queryId: request.query.id,
            queryText: request.query.text,
            subjectAny: request.query.subjectAny,
            eventAny: request.query.eventAny,
            excludedAny: request.query.excludedAny,
          },
          resolveNewsCredibility(searchResult),
        ),
      );
    });
    const built = buildNewsStoriesWithAudit(hits, window);
    const selection = selectNewsStoriesWithAudit(built.stories, topics);
    const stories = selection.stories;
    const audit = buildNewsAudit(
      requests,
      settled,
      built.decisions,
      selection.decisions,
      built.stories.length,
      stories.length,
    );
    return {
      audit,
      day: window.day,
      edition: input.edition,
      generatedAt,
      itemCount: stories.length,
      warnings,
      sourceStatus,
      windowLabel: window.label,
      stories,
      topics,
    };
  });
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseInput(value: unknown): RivusNewsBriefInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Rivus news brief input must be an object.");
  }
  const input = value as Record<string, unknown>;
  if (input.edition !== "noon" && input.edition !== "evening") {
    throw new Error("edition must be noon or evening.");
  }
  if (typeof input.occurrence !== "string" || input.occurrence.trim() === "") {
    throw new Error("occurrence must be a non-empty date-time string.");
  }
  let since: string | undefined;
  if (input.since !== undefined) {
    if (typeof input.since !== "string" || !Number.isFinite(Date.parse(input.since)))
      throw new Error("since must be an ISO date-time.");
    const duration = Date.parse(input.occurrence) - Date.parse(input.since);
    if (!(duration > 0 && duration <= 72 * 3_600_000))
      throw new Error("Catch-up window must be within 72 hours of occurrence.");
    since = input.since;
  }
  let reportedUrls: string[] | undefined;
  if (input.reportedUrls !== undefined) {
    if (
      !Array.isArray(input.reportedUrls) ||
      input.reportedUrls.length > 1000 ||
      input.reportedUrls.some((url) => typeof url !== "string" || !canonicalizeUrl(url))
    )
      throw new Error("reportedUrls must contain at most 1000 valid URLs.");
    reportedUrls = input.reportedUrls.map((url) => canonicalizeUrl(url as string)!);
  }
  return { edition: input.edition, occurrence: input.occurrence, since, reportedUrls };
}

function createSearch(
  env: NodeJS.ProcessEnv,
  mode: string,
  now?: () => Date,
): ReturnType<typeof createBudgetedNewsSearch> {
  if (mode === "grok") {
    const model = env.NEWS_GROK_MODEL?.trim() || undefined;
    if (model && !/^[a-zA-Z0-9._-]+$/u.test(model)) throw new Error("Invalid NEWS_GROK_MODEL.");
    const client = new GrokSearchClient({
      executable: env.NEWS_GROK_EXECUTABLE?.trim() || undefined,
      model,
      timeoutMs: boundedInteger(env.NEWS_GROK_TIMEOUT_MS, 120_000, 1_000, 180_000),
      timezoneOffset: env.FEED_TIMEZONE_OFFSET ?? "+08:00",
    });
    return createBudgetedNewsSearch({
      search: (input) => client.search(input),
      provider: `grok://cli/v1/${model ?? "default"}`,
      stateFile: env.NEWS_SEARCH_STATE_FILE?.trim() || searchBudgetDefaults.stateFile,
      dailyLimit: boundedInteger(
        env.NEWS_SEARCH_DAILY_LIMIT,
        searchBudgetDefaults.grok.dailyLimit,
        0,
        100_000,
      ),
      monthlyLimit: boundedInteger(
        env.NEWS_SEARCH_MONTHLY_LIMIT,
        searchBudgetDefaults.grok.monthlyLimit,
        0,
        1_000_000,
      ),
      timezoneOffset: env.FEED_TIMEZONE_OFFSET ?? "+08:00",
      cacheTtlMs:
        boundedInteger(
          env.NEWS_SEARCH_CACHE_TTL_MINUTES,
          searchBudgetDefaults.cacheTtlMinutes,
          0,
          43_200,
        ) * 60_000,
      now,
    });
  }
  const apiKey = env.DOUBAO_SEARCH_API_KEY?.trim();
  if (!apiKey) throw new Error("DOUBAO_SEARCH_API_KEY is required for news briefs.");
  const client = new DoubaoSearchClient({
    apiKey,
    baseUrl: env.DOUBAO_SEARCH_BASE_URL?.trim() || undefined,
    timeoutMs: boundedInteger(env.NEWS_SEARCH_TIMEOUT_MS, 15_000, 1_000, 60_000),
  });
  return createBudgetedNewsSearch({
    search: (input) => client.search(input),
    stateFile: env.NEWS_SEARCH_STATE_FILE?.trim() || searchBudgetDefaults.stateFile,
    provider:
      env.DOUBAO_SEARCH_BASE_URL?.trim() || "https://open.feedcoopapi.com/search_api/web_search",
    dailyLimit: boundedInteger(
      env.NEWS_SEARCH_DAILY_LIMIT,
      searchBudgetDefaults.doubao.dailyLimit,
      0,
      100_000,
    ),
    monthlyLimit: boundedInteger(
      env.NEWS_SEARCH_MONTHLY_LIMIT,
      searchBudgetDefaults.doubao.monthlyLimit,
      0,
      1_000_000,
    ),
    timezoneOffset: env.FEED_TIMEZONE_OFFSET ?? "+08:00",
    cacheTtlMs:
      boundedInteger(
        env.NEWS_SEARCH_CACHE_TTL_MINUTES,
        searchBudgetDefaults.cacheTtlMinutes,
        0,
        43_200,
      ) * 60_000,
    now,
  });
}

function timeAtOffset(instant: number, timezoneOffset: string): string {
  const shifted = new Date(instant + parseOffsetMilliseconds(timezoneOffset));
  return shifted.toISOString().slice(11, 16);
}

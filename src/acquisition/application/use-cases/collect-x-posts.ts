import { Effect, Schema } from "effect";

import { calendarDayAtOffset } from "../../../kernel/time.js";
import { GrokProcessRequest } from "../ports.js";
import {
  isSearchFailure,
  type NewsSearchError,
  type SearchPage,
  type SearchUsage,
} from "../../domain/search/index.js";
import { searchBudgetDefaults } from "../services/budget-defaults.js";
import type { BudgetedSearch } from "../services/with-budget.js";

const instantSchema = Schema.String.check(
  Schema.makeFilter(
    (value: string) => /(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value)),
  ),
);
const inputSchema = Schema.Struct({
  handles: Schema.Array(Schema.String.check(Schema.isPattern(/^@?[a-zA-Z0-9_]{1,15}$/u))),
  since: instantSchema,
  until: instantSchema,
});

/**
 * Native-search receipt copied onto a page or failure. The JSON field name is
 * the historical one; the canonical shape lives in the provider's ACL.
 */
type NativeSearchReceipt = {
  nativeTools: string[];
  nativeCallCount?: number;
  elapsedMs?: number;
  rejectedResults: number;
};

function pageReceipt(page: SearchPage): NativeSearchReceipt | undefined {
  return (page as SearchPage & { grok?: NativeSearchReceipt }).grok;
}

function errorReceipt(error: NewsSearchError): NativeSearchReceipt | undefined {
  return (error as NewsSearchError & { grok?: NativeSearchReceipt }).grok;
}

export type XAccountPosts = {
  posts: Array<{
    id: string;
    author: string;
    url: string;
    title: string;
    summary: string;
    publishedAt: string;
  }>;
  audit: Array<{
    handle: string;
    status: "ok" | "failed";
    acceptedCount: number;
    limitReached?: boolean;
    errorCode?: string;
    grok?: NativeSearchReceipt;
    searchUsage?: SearchUsage;
  }>;
};

export type XAccountClient = {
  search: (value: GrokProcessRequest) => Promise<SearchPage>;
};

export type OpenSearchBudget = (options: {
  provider: string;
  stateFile: string;
  dailyLimit: number;
  monthlyLimit: number;
  timezoneOffset: string;
  cacheTtlMs: number;
  now?: () => Date;
  search: () => Promise<SearchPage>;
}) => BudgetedSearch;

export type CollectXAccountOptions = {
  env: NodeJS.ProcessEnv;
  now?: () => Date;
  client?: XAccountClient;
  openClient?: () => XAccountClient;
  openBudget: OpenSearchBudget;
};

/** Account subscriptions use caller-owned windows and do not apply news-topic ranking. */
export function collectXAccountPosts(
  value: typeof inputSchema.Type,
  options: CollectXAccountOptions,
): Effect.Effect<XAccountPosts, unknown> {
  return Effect.gen(function* () {
    const input = yield* Effect.try({
      try: () => Schema.decodeUnknownSync(inputSchema)(value),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
    const since = new Date(input.since).toISOString();
    const until = new Date(input.until).toISOString();
    if (since >= until)
      return yield* Effect.fail(
        new Error("X account collection requires a non-empty time window."),
      );
    const handles = [
      ...new Set(input.handles.map((handle) => handle.replace(/^@/u, "").toLowerCase())),
    ];
    const result: XAccountPosts = { posts: [], audit: [] };
    if (!handles.length) return result;
    const env = options.env;
    const timezoneOffset = env.FEED_TIMEZONE_OFFSET ?? "+08:00";
    const model = env.NEWS_GROK_MODEL?.trim() || undefined;
    if (model && !/^[a-zA-Z0-9._-]+$/u.test(model))
      return yield* Effect.fail(new Error("Invalid NEWS_GROK_MODEL."));
    const count = yield* Effect.try({
      try: () => boundedInteger(env.X_ACCOUNT_POSTS_PER_FETCH, 30, 1, 50),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
    const client = options.client ?? options.openClient?.();
    if (!client)
      return yield* Effect.fail(new Error("X account collection requires a search client."));
    for (const handle of handles) {
      const search = options.openBudget({
        provider: `grok://cli/v1/${model ?? "default"}`,
        stateFile: env.NEWS_SEARCH_STATE_FILE?.trim() || searchBudgetDefaults.stateFile,
        dailyLimit: yield* Effect.try({
          try: () =>
            boundedInteger(
              env.NEWS_SEARCH_DAILY_LIMIT,
              searchBudgetDefaults.grok.dailyLimit,
              0,
              100_000,
            ),
          catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
        }),
        monthlyLimit: yield* Effect.try({
          try: () =>
            boundedInteger(
              env.NEWS_SEARCH_MONTHLY_LIMIT,
              searchBudgetDefaults.grok.monthlyLimit,
              0,
              1_000_000,
            ),
          catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
        }),
        timezoneOffset,
        cacheTtlMs:
          (yield* Effect.try({
            try: () =>
              boundedInteger(
                env.NEWS_SEARCH_CACHE_TTL_MINUTES,
                searchBudgetDefaults.cacheTtlMinutes,
                0,
                43_200,
              ),
            catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
          })) * 60_000,
        now: options.now,
        search: () =>
          client.search({
            handle,
            since,
            until,
            count,
            instruction: [
              `Collect posts authored by @${handle}. Use from:${handle} with Latest ordering.`,
              "Include original posts and quotes with the author's own commentary, including experiences, opinions, research and tutorials. Exclude pure reposts and replies; do not restrict to news or announcements.",
              "Summarize only the author's own claims, preserve attribution, and distinguish a new post from the date of any older event it discusses.",
            ].join("\n"),
          }),
      });
      const outcome = yield* Effect.result(
        search({
          query: `x-account:v1:${handle}:${since}:${until}`,
          count,
          sinceDay: calendarDayAtOffset(since, timezoneOffset),
          day: calendarDayAtOffset(new Date(Date.parse(until) - 1).toISOString(), timezoneOffset),
          sourcePolicy: "news",
        }),
      );
      if (outcome._tag === "Failure") {
        const error = outcome.failure;
        if (!isSearchFailure(error)) return yield* Effect.fail(error);
        result.audit.push({
          handle,
          status: "failed",
          acceptedCount: 0,
          errorCode: error.code,
          grok: errorReceipt(error as NewsSearchError),
        });
        continue;
      }
      const page = outcome.success;
      result.posts.push(
        ...page.results.map((post) => ({
          id: post.id,
          author: handle,
          url: post.url,
          title: post.title,
          summary: post.summary ?? "",
          publishedAt: post.publishTime!,
        })),
      );
      result.audit.push({
        handle,
        status: "ok",
        acceptedCount: page.results.length,
        limitReached: page.resultCount >= count,
        grok: pageReceipt(page),
        searchUsage: page.searchUsage,
      });
    }
    return result;
  });
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Numeric configuration must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

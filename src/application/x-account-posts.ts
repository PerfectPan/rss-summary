import { Schema } from "effect";

import { calendarDayAtOffset } from "../domain/time.js";
import { GrokXClient } from "../infrastructure/grok-x.js";
import { createBudgetedNewsSearch } from "../infrastructure/news-search-budget.js";
import { NewsSearchError, type NewsSearchPage } from "../infrastructure/news-search.js";
import { boundedInteger } from "../infrastructure/parsing.js";

const instantSchema = Schema.String.pipe(
  Schema.filter(
    (value) => /(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value)),
  ),
);
const inputSchema = Schema.Struct({
  handles: Schema.Array(Schema.String.pipe(Schema.pattern(/^@?[a-zA-Z0-9_]{1,15}$/u))),
  since: instantSchema,
  until: instantSchema,
});

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
    grok?: NewsSearchPage["grok"];
    searchUsage?: NewsSearchPage["searchUsage"];
  }>;
};

type Dependencies = {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  client?: Pick<GrokXClient, "search">;
};

/** Account subscriptions use caller-owned windows and do not apply news-topic ranking. */
export async function collectXAccountPosts(
  value: typeof inputSchema.Type,
  dependencies: Dependencies = {},
): Promise<XAccountPosts> {
  const input = Schema.decodeUnknownSync(inputSchema)(value);
  const since = new Date(input.since).toISOString();
  const until = new Date(input.until).toISOString();
  if (since >= until) throw new Error("X account collection requires a non-empty time window.");
  const handles = [
    ...new Set(input.handles.map((handle) => handle.replace(/^@/u, "").toLowerCase())),
  ];
  const result: XAccountPosts = { posts: [], audit: [] };
  if (!handles.length) return result;
  const env = dependencies.env ?? process.env;
  const timezoneOffset = env.FEED_TIMEZONE_OFFSET ?? "+08:00";
  const model = env.NEWS_GROK_MODEL?.trim() || undefined;
  if (model && !/^[a-zA-Z0-9._-]+$/u.test(model)) throw new Error("Invalid NEWS_GROK_MODEL.");
  const count = boundedInteger(env.X_ACCOUNT_POSTS_PER_FETCH, 30, 1, 50);
  const client =
    dependencies.client ??
    new GrokXClient({
      executable: env.NEWS_GROK_EXECUTABLE?.trim() || undefined,
      model,
      timeoutMs: boundedInteger(env.NEWS_GROK_TIMEOUT_MS, 120_000, 1_000, 180_000),
    });
  for (const handle of handles) {
    const search = createBudgetedNewsSearch({
      provider: `grok://cli/v1/${model ?? "default"}`,
      stateFile: env.NEWS_SEARCH_STATE_FILE?.trim() || ".state/news-search.json",
      dailyLimit: boundedInteger(env.NEWS_SEARCH_DAILY_LIMIT, 4, 0, 100_000),
      monthlyLimit: boundedInteger(env.NEWS_SEARCH_MONTHLY_LIMIT, 120, 0, 1_000_000),
      timezoneOffset,
      cacheTtlMs: boundedInteger(env.NEWS_SEARCH_CACHE_TTL_MINUTES, 360, 0, 43_200) * 60_000,
      now: dependencies.now,
      search: () =>
        client.search({
          handle,
          since,
          until,
          count,
          instruction: [
            `Collect posts authored by @${handle}. Use from:${handle} with Latest ordering.`,
            "Include original posts and quotes with the author's own commentary, including experiences, opinions, research and tutorials. Exclude pure reposts and replies; do not restrict to news or announcements.",
            "Start with one keyword search returning the posts together. Only if essential text is missing, make at most one additional thread fetch. Do not fetch every post separately or search repeatedly to fill a quota.",
            "Summarize only the author's own claims, preserve attribution, and distinguish a new post from the date of any older event it discusses.",
          ].join("\n"),
        }),
    });
    try {
      const page = await search({
        // Exact windows must not reuse a snapshot whose end precedes this subscription run.
        query: `x-account:v1:${handle}:${since}:${until}`,
        count,
        sinceDay: calendarDayAtOffset(since, timezoneOffset),
        day: calendarDayAtOffset(new Date(Date.parse(until) - 1).toISOString(), timezoneOffset),
        sourcePolicy: "news",
      });
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
        grok: page.grok,
        searchUsage: page.searchUsage,
      });
    } catch (error) {
      if (!(error instanceof NewsSearchError)) throw error;
      result.audit.push({ handle, status: "failed", acceptedCount: 0, errorCode: error.code });
    }
  }
  return result;
}

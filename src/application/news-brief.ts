import { Effect } from "effect";
import { canonicalizeUrl } from "../domain/text.js";

import {
  buildNewsStoriesWithAudit,
  selectNewsStoriesWithAudit,
  type NewsBriefEdition,
  type NewsSearchHit,
  type NewsTopic,
  type SelectedNewsStory,
} from "../domain/news.js";
import {
  calendarDayAtOffset,
  parseOffsetMilliseconds,
  startOfCalendarDay,
} from "../domain/time.js";
import { boundedInteger } from "../infrastructure/parsing.js";
import { loadNewsTopics } from "../infrastructure/news-topics.js";
import {
  DoubaoSearchError,
  DoubaoSearchClient,
  type DoubaoSearchInput,
  type DoubaoSearchPage,
} from "../infrastructure/doubao-search.js";
import { GlmResearchClient } from "../infrastructure/glm-research.js";
import { createHybridNewsSearch, type NewsSearchRequest } from "./hybrid-news-search.js";
import { attempt } from "./effect.js";
import {
  buildNewsAudit,
  summarizeNewsSources,
  type NewsSourceStatus,
  type NewsBriefAudit,
} from "./news-audit.js";

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
export class AllDoubaoQueriesFailedError extends Error {
  readonly result: RivusNewsBriefResult;

  constructor(result: RivusNewsBriefResult) {
    super("All Doubao search queries failed.");
    this.name = "AllDoubaoQueriesFailedError";
    this.result = result;
  }
}

type NewsBriefDependencies = {
  glm?: Pick<GlmResearchClient, "search" | "read">;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  random?: () => number;
  search?: (input: DoubaoSearchInput) => Promise<DoubaoSearchPage>;
  sleep?: (milliseconds: number) => Promise<void>;
  topics?: NewsTopic[];
};

const noonCutoffMinutes = 12 * 60 + 30;
const newsSearchConcurrency = 2;
const newsSearchMaxAttempts = 3;
const newsSearchRetryBaseMs = 250;

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
        const editionWindow = resolveNewsEditionWindow(
          input.occurrence,
          timezoneOffset,
          input.edition,
        );
        if (input.since && Date.parse(input.since) >= editionWindow.until)
          throw new Error("Catch-up start must precede the edition cutoff.");
        return {
          ...editionWindow,
          ...(input.since
            ? {
                since: Date.parse(input.since),
                label: `${input.since}–${input.occurrence}（补采）`,
              }
            : {}),
          reportedUrls: input.reportedUrls,
        };
      },
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
    const rotation =
      Math.floor(Date.parse(`${window.day}T00:00:00Z`) / 86_400_000) * 2 +
      (input.edition === "evening" ? 1 : 0);
    const topics = (dependencies.topics ?? loadNewsTopics(env.NEWS_TOPICS_FILE)).filter(
      ({ enabled }) => enabled,
    );
    if (topics.length === 0) {
      return yield* Effect.fail(new Error("At least one news topic must be enabled."));
    }
    const count = boundedInteger(env.NEWS_SEARCH_COUNT_PER_QUERY, 10, 1, 50);
    const search = yield* Effect.try({
      try: () => dependencies.search ?? createSearch(env),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });

    const requests = topics.flatMap((topic) =>
      topic.queries.map((query) => ({
        query,
        topic,
        input: {
          query: query.glm?.sourceQueries
            ? (query.glm.sourceQueries[query.glm.domains[rotation % query.glm.domains.length]!] ??
              query.text)
            : query.text,
          count,
          day: window.day,
          sinceDay: calendarDayAtOffset(new Date(window.since).toISOString(), timezoneOffset),
          sourcePolicy: topic.sourcePolicy,
        },
      })),
    );
    const mode = env.NEWS_SEARCH_MODE ?? "doubao";
    if (mode !== "doubao" && mode !== "hybrid" && mode !== "combined") {
      return yield* Effect.fail(new Error("NEWS_SEARCH_MODE must be doubao, hybrid or combined."));
    }
    const primarySearch = (input: DoubaoSearchInput) =>
      searchWithRetry(input, search, {
        random: dependencies.random ?? Math.random,
        sleep: dependencies.sleep ?? sleep,
      });
    const execute = yield* Effect.try({
      try: () =>
        mode !== "doubao"
          ? createHybridNewsSearch({
              search: primarySearch,
              glm:
                dependencies.glm ?? new GlmResearchClient({ apiKey: env.GLM_CODING_API_KEY ?? "" }),
              window,
              maxSearches: boundedInteger(env.NEWS_GLM_MAX_SEARCHES, 14, 1, 64),
              queryIds: requests.map(({ query }) => query.id),
              rotation,
              combine: mode === "combined",
              recency:
                (dependencies.now?.() ?? new Date()).getTime() - window.since > 7 * 86_400_000
                  ? "noLimit"
                  : "oneWeek",
              maxReads: boundedInteger(env.NEWS_GLM_MAX_READS, 14, 1, 64),
            })
          : (request: NewsSearchRequest) => primarySearch(request.input),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
    const settled = yield* attempt(
      settleSearchRequests(requests, execute, mode !== "doubao" ? 1 : newsSearchConcurrency),
    );
    const successful = settled.filter(
      (result): result is PromiseFulfilledResult<DoubaoSearchPage> => result.status === "fulfilled",
    );
    const { sourceStatus, warnings } = summarizeNewsSources(requests, settled);
    const generatedAt = (dependencies.now ?? (() => new Date()))().toISOString();
    if (successful.length === 0) {
      const failures = settled.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (!failures.every((error) => error instanceof DoubaoSearchError)) {
        return yield* Effect.fail(
          new AggregateError(failures, "All Doubao search queries failed."),
        );
      }
      return yield* Effect.fail(
        new AllDoubaoQueriesFailedError({
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
        }),
      );
    }

    const hits: NewsSearchHit[] = [];
    settled.forEach((result, index) => {
      if (result.status !== "fulfilled") return;
      const request = requests[index]!;
      hits.push(
        ...result.value.results.map((searchResult) => ({
          ...searchResult,
          topicId: request.topic.id,
          topicLabel: request.topic.label,
          sourcePolicy: request.topic.sourcePolicy,
          queryId: request.query.id,
          queryText: request.query.text,
          subjectAny: request.query.subjectAny,
          eventAny: request.query.eventAny,
          excludedAny: request.query.excludedAny,
        })),
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

async function settleSearchRequests(
  requests: NewsSearchRequest[],
  execute: (request: NewsSearchRequest) => Promise<DoubaoSearchPage>,
  concurrency = newsSearchConcurrency,
): Promise<PromiseSettledResult<DoubaoSearchPage>[]> {
  const settled: PromiseSettledResult<DoubaoSearchPage>[] = [];
  settled.length = requests.length;
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < requests.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        settled[index] = { status: "fulfilled", value: await execute(requests[index]!) };
      } catch (reason) {
        settled[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, requests.length) }, () => worker()));
  return settled;
}

async function searchWithRetry(
  input: DoubaoSearchInput,
  search: (input: DoubaoSearchInput) => Promise<DoubaoSearchPage>,
  dependencies: { random: () => number; sleep: (milliseconds: number) => Promise<void> },
): Promise<DoubaoSearchPage> {
  for (let attemptNumber = 1; attemptNumber <= newsSearchMaxAttempts; attemptNumber += 1) {
    try {
      return await search(input);
    } catch (error) {
      if (attemptNumber === newsSearchMaxAttempts || !isTransientSearchError(error)) throw error;
      await dependencies.sleep(retryDelayMs(error, attemptNumber, dependencies.random));
    }
  }
  throw new Error("Doubao search retry attempts exhausted.");
}

function isTransientSearchError(error: unknown): error is DoubaoSearchError {
  return (
    error instanceof DoubaoSearchError &&
    (error.code === "rate_limit_exceeded" || error.code === "http_429")
  );
}

function retryDelayMs(
  error: DoubaoSearchError,
  attemptNumber: number,
  random: () => number,
): number {
  if (error.retryAfterMs !== undefined) return error.retryAfterMs;
  const jitter = 0.5 + Math.min(1, Math.max(0, random()));
  return Math.round(newsSearchRetryBaseMs * 2 ** (attemptNumber - 1) * jitter);
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
): (input: DoubaoSearchInput) => Promise<DoubaoSearchPage> {
  const apiKey = env.DOUBAO_SEARCH_API_KEY?.trim();
  if (!apiKey) throw new Error("DOUBAO_SEARCH_API_KEY is required for news briefs.");
  const client = new DoubaoSearchClient({
    apiKey,
    baseUrl: env.DOUBAO_SEARCH_BASE_URL?.trim() || undefined,
    timeoutMs: boundedInteger(env.NEWS_SEARCH_TIMEOUT_MS, 15_000, 1_000, 60_000),
  });
  return (input) => client.search(input);
}

function timeAtOffset(instant: number, timezoneOffset: string): string {
  const shifted = new Date(instant + parseOffsetMilliseconds(timezoneOffset));
  return shifted.toISOString().slice(11, 16);
}

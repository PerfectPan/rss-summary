import { Effect } from "effect";

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
import { attempt } from "./effect.js";
import { buildNewsAudit, type NewsBriefAudit } from "./news-audit.js";

export type { NewsBriefEdition };

export type RivusNewsBriefInput = {
  occurrence: string;
  edition: NewsBriefEdition;
};

/** Application result: pure document fields. Presentation adds `markdown`. */
export type RivusNewsBriefResult = {
  audit: NewsBriefAudit;
  day: string;
  edition: NewsBriefEdition;
  generatedAt: string;
  itemCount: number;
  warnings: string[];
  windowLabel: string;
  stories: SelectedNewsStory[];
  topics: NewsTopic[];
};

/** Tool shape after presentation renders Markdown. */
export type RivusNewsBriefOutput = RivusNewsBriefResult & { markdown: string };

type NewsBriefDependencies = {
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
      try: () => resolveNewsEditionWindow(input.occurrence, timezoneOffset, input.edition),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
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
          query: query.text,
          count,
          day: window.day,
          sourcePolicy: topic.sourcePolicy,
        },
      })),
    );
    const settled = yield* attempt(
      settleSearchRequests(requests, (input) =>
        searchWithRetry(input, search, {
          random: dependencies.random ?? Math.random,
          sleep: dependencies.sleep ?? sleep,
        }),
      ),
    );
    const successful = settled.filter(
      (result): result is PromiseFulfilledResult<DoubaoSearchPage> => result.status === "fulfilled",
    );
    if (successful.length === 0) {
      return yield* Effect.fail(new Error("All Doubao search queries failed."));
    }

    const topicFailureWarnings = topicWarnings(requests, settled);
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
    const missingPublishTimeCount = built.decisions.filter(
      ({ reason }) => reason === "invalid-publish-time",
    ).length;
    const warnings =
      missingPublishTimeCount > 0
        ? [
            ...topicFailureWarnings,
            `Doubao 搜索：${missingPublishTimeCount} 条结果缺少有效的发布时间被丢弃`,
          ]
        : topicFailureWarnings;
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
    const generatedAt = (dependencies.now ?? (() => new Date()))().toISOString();
    return {
      audit,
      day: window.day,
      edition: input.edition,
      generatedAt,
      itemCount: stories.length,
      warnings,
      windowLabel: window.label,
      stories,
      topics,
    };
  });
}

async function settleSearchRequests(
  requests: Array<{ input: DoubaoSearchInput }>,
  execute: (input: DoubaoSearchInput) => Promise<DoubaoSearchPage>,
): Promise<PromiseSettledResult<DoubaoSearchPage>[]> {
  const settled: PromiseSettledResult<DoubaoSearchPage>[] = [];
  settled.length = requests.length;
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < requests.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        settled[index] = { status: "fulfilled", value: await execute(requests[index]!.input) };
      } catch (reason) {
        settled[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(newsSearchConcurrency, requests.length) }, () => worker()),
  );
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
  return { edition: input.edition, occurrence: input.occurrence };
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

function topicWarnings(
  requests: Array<{ topic: NewsTopic }>,
  settled: PromiseSettledResult<DoubaoSearchPage>[],
): string[] {
  const failures = new Map<string, { label: string; count: number }>();
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") return;
    const topic = requests[index]!.topic;
    const current = failures.get(topic.id) ?? { label: topic.label, count: 0 };
    current.count += 1;
    failures.set(topic.id, current);
  });
  return [...failures.values()].map(({ label, count }) => `${label}：${count} 个查询暂不可用`);
}

function timeAtOffset(instant: number, timezoneOffset: string): string {
  const shifted = new Date(instant + parseOffsetMilliseconds(timezoneOffset));
  return shifted.toISOString().slice(11, 16);
}

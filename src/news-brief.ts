import { DoubaoSearchClient, type DoubaoSearchInput, type DoubaoSearchPage } from "./doubao-search.js";
import { buildNewsStories, selectNewsStories, type NewsSearchHit } from "./news-domain.js";
import { renderNewsBrief, type NewsBriefEdition } from "./news-render.js";
import { loadNewsTopics, type NewsTopic } from "./news-topics.js";
import { calendarDayAtOffset, startOfCalendarDay } from "./scheduled-date.js";

export type RivusNewsBriefInput = {
  occurrence: string;
  edition: NewsBriefEdition;
};

export type RivusNewsBriefResult = {
  day: string;
  edition: NewsBriefEdition;
  generatedAt: string;
  itemCount: number;
  markdown: string;
  warnings: string[];
  windowLabel: string;
};

type NewsBriefDependencies = {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  search?: (input: DoubaoSearchInput) => Promise<DoubaoSearchPage>;
  topics?: NewsTopic[];
};

const noonCutoffMinutes = 12 * 60 + 30;

export function resolveNewsEditionWindow(
  occurrence: string,
  timezoneOffset: string,
  edition: NewsBriefEdition,
): { day: string; since: number; until: number; label: string } {
  const until = Date.parse(occurrence);
  if (!Number.isFinite(until)) throw new Error("occurrence must be a valid date-time.");
  const day = calendarDayAtOffset(occurrence, timezoneOffset);
  const dayStart = startOfCalendarDay(day, timezoneOffset);
  const noonCutoff = dayStart + noonCutoffMinutes * 60_000;
  const since = edition === "noon" ? dayStart : noonCutoff;
  const windowEnd = edition === "noon" ? Math.min(until, noonCutoff) : until;
  if (windowEnd <= since) throw new Error(`${edition} news occurrence is earlier than its delivery window.`);
  return {
    day,
    since,
    until: windowEnd,
    label: `${edition === "noon" ? "00:00" : "12:30"}–${timeAtOffset(windowEnd, timezoneOffset)}`,
  };
}

export async function generateRivusNewsBrief(
  value: unknown,
  dependencies: NewsBriefDependencies = {},
): Promise<RivusNewsBriefResult> {
  const input = parseInput(value);
  const env = dependencies.env ?? process.env;
  const timezoneOffset = env.FEED_TIMEZONE_OFFSET ?? "+08:00";
  const window = resolveNewsEditionWindow(input.occurrence, timezoneOffset, input.edition);
  const topics = (dependencies.topics ?? loadNewsTopics(env.NEWS_TOPICS_FILE)).filter(({ enabled }) => enabled);
  if (topics.length === 0) throw new Error("At least one news topic must be enabled.");
  const count = boundedInteger(env.NEWS_SEARCH_COUNT_PER_QUERY, 10, 1, 50);
  const search = dependencies.search ?? createSearch(env);

  const requests = topics.flatMap((topic) =>
    topic.queries.map((query) => ({ query, topic, promise: search({ query, count, day: window.day, sourcePolicy: topic.sourcePolicy }) })),
  );
  const settled = await Promise.allSettled(requests.map(({ promise }) => promise));
  const successful = settled.filter((result): result is PromiseFulfilledResult<DoubaoSearchPage> => result.status === "fulfilled");
  if (successful.length === 0) throw new Error("All Doubao search queries failed.");

  const warnings = topicWarnings(requests, settled);
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
        query: request.query,
      })),
    );
  });
  const stories = selectNewsStories(buildNewsStories(hits, window), topics);
  const generatedAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const document = {
    day: window.day,
    edition: input.edition,
    generatedAt,
    stories,
    topics,
    warnings,
    windowLabel: window.label,
  };
  return {
    day: window.day,
    edition: input.edition,
    generatedAt,
    itemCount: stories.length,
    markdown: renderNewsBrief(document),
    warnings,
    windowLabel: window.label,
  };
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

function createSearch(env: NodeJS.ProcessEnv): (input: DoubaoSearchInput) => Promise<DoubaoSearchPage> {
  const apiKey = env.DOUBAO_SEARCH_API_KEY?.trim() || env.WEB_SEARCH_API_KEY?.trim();
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

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Numeric configuration must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function timeAtOffset(instant: number, timezoneOffset: string): string {
  const sign = timezoneOffset.startsWith("-") ? -1 : 1;
  const [hours, minutes] = timezoneOffset.slice(1).split(":").map(Number);
  const shifted = new Date(instant + sign * ((hours ?? 0) * 60 + (minutes ?? 0)) * 60_000);
  return shifted.toISOString().slice(11, 16);
}

import { Effect } from "effect";

import {
  buildSignalRepos,
  buildSignalUpdates,
  classifyUpdateKind,
  selectSignalItems,
  type SignalRepoHit,
  type SignalUpdateHit,
} from "../domain/signal.js";
import { calendarDayAtOffset, endOfCalendarDay, shiftCalendarDay, startOfCalendarDay } from "../domain/time.js";
import { boundedInteger, hostnameOf } from "../infrastructure/parsing.js";
import { loadSignalSources, type SignalSourceConfig } from "../infrastructure/signal-sources.js";
import { DoubaoSearchClient, type DoubaoSearchInput, type DoubaoSearchPage } from "../infrastructure/doubao-search.js";
import { HackerNewsClient, type HackerNewsSearchInput, type HackerNewsStory } from "../infrastructure/hacker-news.js";
import {
  GitHubSearchClient,
  buildRepositorySearchQuery,
  type GitHubRepositorySearchInput,
  type GitHubSearchRepo,
} from "../infrastructure/github-search.js";
import { renderSignalBrief } from "../presentation/signal-render.js";
import { attempt } from "./effect.js";

export type SignalBriefInput = {
  day?: string;
  occurrence?: string;
};

export type SignalBriefResult = {
  day: string;
  generatedAt: string;
  itemCount: number;
  markdown: string;
  sections: { updates: number; opensource: number };
  warnings: string[];
};

type SignalBriefDependencies = {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  config?: SignalSourceConfig;
  doubaoSearch?: (input: DoubaoSearchInput) => Promise<DoubaoSearchPage>;
  hackerNewsSearch?: (input: HackerNewsSearchInput) => Promise<HackerNewsStory[]>;
  githubSearch?: (input: GitHubRepositorySearchInput) => Promise<GitHubSearchRepo[]>;
};

export function generateSignalBrief(
  value: unknown,
  dependencies: SignalBriefDependencies = {},
): Effect.Effect<SignalBriefResult, Error> {
  return Effect.gen(function* () {
    const input = parseInput(value);
    const env = dependencies.env ?? process.env;
    const config = dependencies.config ?? loadSignalSources(env.SIGNAL_SOURCES_FILE);
    const timezoneOffset = env[config.timezoneOffsetEnv] ?? "+08:00";
    const day = input.day ?? calendarDayAtOffset(input.occurrence!, timezoneOffset);
    const window = {
      day,
      since: startOfCalendarDay(day, timezoneOffset),
      until: endOfCalendarDay(day, timezoneOffset),
      timezoneOffset,
    };

    const timeoutMs = boundedInteger(env.SIGNAL_SEARCH_TIMEOUT_MS, 15_000, 1_000, 60_000);
    const doubaoSearch = dependencies.doubaoSearch ?? createDoubaoSearch(env, timeoutMs);
    const hackerNewsSearch = dependencies.hackerNewsSearch ?? createHackerNewsSearch(timeoutMs);
    const githubSearch = dependencies.githubSearch ?? createGithubSearch(env, timeoutMs);

    const settled = yield* attempt(
      Promise.allSettled([
        fetchOfficialUpdates(config, doubaoSearch, window.day),
        fetchHackerNews(config, hackerNewsSearch, window),
        fetchGithubRepos(config, githubSearch, window.day),
      ]),
    );
    const [officialResult, hnResult, githubResult] = settled;

    const officialFailed =
      officialResult.status === "rejected" ||
      (config.officialSearch.intents.length > 0 &&
        officialResult.value.warnings === config.officialSearch.intents.length);
    if (officialFailed && hnResult.status === "rejected" && githubResult.status === "rejected") {
      throw new Error("All signal sources failed.");
    }

    const warnings: string[] = [];
    if (officialFailed) {
      warnings.push("官方搜索不可用");
    } else if (officialResult.status === "fulfilled" && officialResult.value.warnings > 0) {
      warnings.push(`官方搜索：${officialResult.value.warnings} 个查询暂不可用`);
    }
    if (hnResult.status === "rejected") warnings.push("Hacker News 暂不可用");
    if (githubResult.status === "rejected") warnings.push("GitHub 搜索暂不可用");

    const updateHits: SignalUpdateHit[] = [];
    if (officialResult.status === "fulfilled") updateHits.push(...officialResult.value.hits);
    if (hnResult.status === "fulfilled") updateHits.push(...hnResult.value);

    const repoHits: SignalRepoHit[] = githubResult.status === "fulfilled" ? githubResult.value : [];
    const rules = {
      window,
      scoring: config.scoring,
      frontendBias: config.frontendBias,
      officialDomains: config.officialSearch.domains,
      excludeNamePatterns: config.githubSearch.excludeNamePatterns,
      createdWithinDays: config.githubSearch.createdWithinDays,
    };
    const selected = selectSignalItems(
      buildSignalUpdates(updateHits, rules),
      buildSignalRepos(repoHits, rules),
      config.quotas,
    );
    const markdown = renderSignalBrief({
      day,
      updates: selected.updates,
      opensource: selected.opensource,
      warnings,
      timezoneOffset,
    });

    return {
      day,
      generatedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
      itemCount: selected.updates.length + selected.opensource.length,
      markdown,
      sections: { updates: selected.updates.length, opensource: selected.opensource.length },
      warnings,
    };
  });
}

async function fetchOfficialUpdates(
  config: SignalSourceConfig,
  search: (input: DoubaoSearchInput) => Promise<DoubaoSearchPage>,
  day: string,
): Promise<{ hits: SignalUpdateHit[]; warnings: number }> {
  const requests = config.officialSearch.intents.map((intent) => ({
    intent,
    promise: search({
      query: intent.query,
      count: config.officialSearch.countPerQuery,
      day,
      sourcePolicy: "official",
    }),
  }));
  const settled = await Promise.allSettled(requests.map(({ promise }) => promise));
  const warnings = settled.filter((result) => result.status === "rejected").length;
  const hits: SignalUpdateHit[] = [];
  settled.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    const intent = requests[index]!.intent;
    for (const searchResult of result.value.results) {
      hits.push({
        id: searchResult.id,
        title: searchResult.title,
        url: searchResult.url,
        summary: searchResult.summary ?? searchResult.snippet,
        publishedAt: searchResult.publishTime,
        sourceLabel: searchResult.siteName?.trim() || hostnameOf(searchResult.url),
        kind: intent.kind,
        source: "official",
      });
    }
  });
  return { hits, warnings };
}

async function fetchHackerNews(
  config: SignalSourceConfig,
  search: (input: HackerNewsSearchInput) => Promise<HackerNewsStory[]>,
  window: { since: number; until: number },
): Promise<SignalUpdateHit[]> {
  const stories = await search({
    minPoints: config.hackerNews.minPoints,
    includeShowHn: config.hackerNews.includeShowHn,
    maxItems: config.hackerNews.maxItems,
  });
  return stories
    .filter((story) => {
      const createdAt = Date.parse(story.createdAt);
      return Number.isFinite(createdAt) && createdAt >= window.since && createdAt < window.until;
    })
    .sort((left, right) => right.points - left.points)
    .slice(0, config.hackerNews.maxItems)
    .map((story) => ({
      id: story.id,
      title: story.title,
      url: story.url ?? `https://news.ycombinator.com/item?id=${story.id}`,
      summary: `${story.author} 分享${story.isShowHn ? "（Show HN）" : ""} · ${story.numComments} 条评论`,
      publishedAt: story.createdAt,
      sourceLabel: "Hacker News",
      kind: classifyUpdateKind(story.title, config.frontendBias.modelTitleHints),
      source: "hn" as const,
      points: story.points,
    }));
}

async function fetchGithubRepos(
  config: SignalSourceConfig,
  search: (input: GitHubRepositorySearchInput) => Promise<GitHubSearchRepo[]>,
  day: string,
): Promise<SignalRepoHit[]> {
  const createdSince = shiftCalendarDay(day, -(config.githubSearch.createdWithinDays - 1));
  const query = buildRepositorySearchQuery({
    since: createdSince,
    minStars: config.githubSearch.minStars,
    keywords: [...config.githubSearch.languages, ...config.githubSearch.topics],
  });
  const repos = await search({
    query,
    perPage: config.githubSearch.perPage,
    sort: "stars",
    order: "desc",
  });
  return repos.map((repo) => ({
    id: repo.fullName,
    title: repo.fullName,
    url: repo.htmlUrl,
    description: repo.description,
    language: repo.language,
    stars: repo.stars,
    createdAt: repo.createdAt,
    topics: repo.topics,
    sourceLabel: "GitHub",
  }));
}

function parseInput(value: unknown): SignalBriefInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Signal brief input must be an object.");
  }
  const input = value as Record<string, unknown>;
  const day = optionalDay(input.day);
  const occurrence = optionalString(input.occurrence, "occurrence");
  if (!day && !occurrence) throw new Error("day or occurrence is required.");
  return { day, occurrence };
}

function optionalDay(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error("day must use YYYY-MM-DD format.");
  }
  return value;
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${name} must be a non-empty string.`);
  return value.trim();
}

function createDoubaoSearch(
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): (input: DoubaoSearchInput) => Promise<DoubaoSearchPage> {
  const apiKey = env.DOUBAO_SEARCH_API_KEY?.trim();
  if (!apiKey)
    return async () => {
      throw new Error("DOUBAO_SEARCH_API_KEY is missing.");
    };
  const client = new DoubaoSearchClient({
    apiKey,
    baseUrl: env.DOUBAO_SEARCH_BASE_URL?.trim() || undefined,
    timeoutMs,
  });
  return (input) => client.search(input);
}

function createHackerNewsSearch(timeoutMs: number): (input: HackerNewsSearchInput) => Promise<HackerNewsStory[]> {
  const client = new HackerNewsClient({ timeoutMs });
  return (input) => client.searchStories(input);
}

function createGithubSearch(
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): (input: GitHubRepositorySearchInput) => Promise<GitHubSearchRepo[]> {
  const client = new GitHubSearchClient({
    token: env.GH_FEED_TOKEN?.trim() || env.GITHUB_TOKEN?.trim(),
    timeoutMs,
  });
  return (input) => client.searchRepositories(input);
}

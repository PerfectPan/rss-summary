import { existsSync, readFileSync } from "node:fs";

import { Config, ConfigProvider, Effect, Option } from "effect";

import {
  decodeFeedsJson,
  decodeIndustryJson,
  type FeedSubscription,
  type IndustrySource,
} from "../../acquisition/index.js";
import type { CliArgs } from "./argv.js";
import { defaultIndustrySourcesFile } from "./assets.js";
import {
  defaultGithubHomeStorageState,
  defaultIndustryStateFile,
  defaultRunLogDir,
  defaultStateFile,
} from "./state-root.js";

export type GithubFeedSource = "home" | "events";
export type GithubHomeFetch = "conduit" | "browser";

/**
 * Strongly-typed configuration for the digest/frontier products. Values come
 * from the environment only; CLI arguments are layered on top with
 * {@link applyCliArgs} at the CLI boundary.
 */
export type AppConfig = {
  username: string;
  token?: string;
  githubFeedSource: GithubFeedSource;
  githubHomeFetch: GithubHomeFetch;
  githubHomeStorageState: string;
  githubHomeBrowserChannel?: string;
  webhookUrl?: string;
  outputFormat: "markdown" | "json";
  eventPages: number;
  perPage: number;
  windowHours: number;
  since?: string;
  until?: string;
  day?: string;
  timezoneOffset: string;
  maxRepos: number;
  maxPapers: number;
  dryRun: boolean;
  onlyNew: boolean;
  rssOnly: boolean;
  stateFile: string;
  interests: string[];
  rssFeeds: FeedSubscription[];
  industrySources: IndustrySource[];
  industryStateFile: string;
  runLogDir: string;
  glmCodingApiKey: string;
  /** Reading options for article research. */
  articleResearch: {
    browserChannel: string;
    browserHeadless: boolean;
    browserTimeoutMs: number;
    glmFallback: boolean;
  };
  /** The environment this config was read from; used for exact argv merging. */
  readonly raw: NodeJS.ProcessEnv;
};

const defaultInterests = [
  "agent",
  "coding-agent",
  "llm",
  "mcp",
  "ai",
  "rust",
  "typescript",
  "javascript",
  "toolchain",
  "bundler",
  "vite",
  "deno",
  "testing",
  "performance",
  "skills",
];

/** Read one variable as an optional string; missing keys resolve to undefined. */
const envString = (name: string): Config.Config<string | undefined> =>
  Config.option(Config.String(name)).pipe(Config.map(Option.getOrUndefined));

const asError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

/**
 * Parse the environment into {@link AppConfig} through `effect/Config`.
 * Empty strings are preserved so the historical `??` chains behave identically.
 */
export function loadEnvConfig(
  env: NodeJS.ProcessEnv = process.env,
): Effect.Effect<AppConfig, Error> {
  const config = Effect.gen(function* () {
    // One Config pass reads every variable; empty strings are preserved.
    const value = yield* Config.all({
      githubUsername: envString("GITHUB_USERNAME"),
      ghUsername: envString("GH_USERNAME"),
      ghFeedToken: envString("GH_FEED_TOKEN"),
      githubToken: envString("GITHUB_TOKEN"),
      dryRun: envString("DRY_RUN"),
      githubFeedSource: envString("GITHUB_FEED_SOURCE"),
      githubHomeFetch: envString("GITHUB_HOME_FETCH"),
      githubHomeStorageState: envString("GITHUB_HOME_STORAGE_STATE"),
      githubHomeBrowserChannel: envString("GITHUB_HOME_BROWSER_CHANNEL"),
      notifyWebhookUrl: envString("NOTIFY_WEBHOOK_URL"),
      feedOutputFormat: envString("FEED_OUTPUT_FORMAT"),
      feedEventPages: envString("FEED_EVENT_PAGES"),
      feedPerPage: envString("FEED_PER_PAGE"),
      feedWindowHours: envString("FEED_WINDOW_HOURS"),
      feedSince: envString("FEED_SINCE"),
      feedUntil: envString("FEED_UNTIL"),
      feedDay: envString("FEED_DAY"),
      feedTimezoneOffset: envString("FEED_TIMEZONE_OFFSET"),
      feedMaxRepos: envString("FEED_MAX_REPOS"),
      feedMaxPapers: envString("FEED_MAX_PAPERS"),
      feedOnlyNew: envString("FEED_ONLY_NEW"),
      feedRssOnly: envString("FEED_RSS_ONLY"),
      feedStateFile: envString("FEED_STATE_FILE"),
      feedInterests: envString("FEED_INTERESTS"),
      rssFeeds: envString("RSS_FEEDS"),
      rssFeedsFile: envString("RSS_FEEDS_FILE"),
      industrySources: envString("INDUSTRY_SOURCES"),
      industryFeeds: envString("INDUSTRY_FEEDS"),
      industrySourcesFile: envString("INDUSTRY_SOURCES_FILE"),
      industryFeedsFile: envString("INDUSTRY_FEEDS_FILE"),
      industryStateFile: envString("INDUSTRY_STATE_FILE"),
      feedRunLogDir: envString("FEED_RUN_LOG_DIR"),
      glmCodingApiKey: envString("GLM_CODING_API_KEY"),
      articleBrowserChannel: envString("RSS_ARTICLE_BROWSER_CHANNEL"),
      articleBrowserHeadless: envString("RSS_ARTICLE_BROWSER_HEADLESS"),
      articleBrowserTimeoutMs: envString("RSS_ARTICLE_BROWSER_TIMEOUT_MS"),
      articleGlmFallback: envString("RSS_ARTICLE_GLM_FALLBACK"),
    });
    const username = value.githubUsername ?? value.ghUsername ?? "PerfectPan";
    const token = value.ghFeedToken ?? value.githubToken;
    const dryRun = value.dryRun === "1" || value.dryRun === "true";
    const githubFeedSource = yield* Effect.try({
      try: () => parseGithubFeedSource(value.githubFeedSource),
      catch: asError,
    });
    const githubHomeFetch = yield* Effect.try({
      try: () => parseGithubHomeFetch(value.githubHomeFetch),
      catch: asError,
    });
    const rssFeeds = yield* Effect.try({
      try: () => loadFeedSubscriptions(value.rssFeeds, value.rssFeedsFile),
      catch: asError,
    });
    const industrySources = yield* Effect.try({
      try: () =>
        loadIndustrySources(
          value.industrySources ?? value.industryFeeds,
          value.industrySourcesFile ?? value.industryFeedsFile ?? defaultIndustrySourcesFile(),
        ),
      catch: asError,
    });
    return {
      username,
      ...(token === undefined ? {} : { token }),
      githubFeedSource,
      githubHomeFetch,
      githubHomeStorageState: value.githubHomeStorageState ?? defaultGithubHomeStorageState,
      ...(value.githubHomeBrowserChannel === undefined
        ? {}
        : { githubHomeBrowserChannel: value.githubHomeBrowserChannel }),
      webhookUrl: dryRun ? undefined : value.notifyWebhookUrl,
      outputFormat: value.feedOutputFormat === "json" ? ("json" as const) : ("markdown" as const),
      eventPages: numberFrom(value.feedEventPages, 3),
      perPage: numberFrom(value.feedPerPage, 100),
      windowHours: numberFrom(value.feedWindowHours, 36),
      since: value.feedSince,
      until: value.feedUntil,
      day: value.feedDay,
      timezoneOffset: value.feedTimezoneOffset ?? "+08:00",
      maxRepos: numberFrom(value.feedMaxRepos, 30),
      maxPapers: Math.min(numberFrom(value.feedMaxPapers, 8), 8),
      dryRun,
      onlyNew: value.feedOnlyNew === "1" || value.feedOnlyNew === "true",
      rssOnly: value.feedRssOnly === "1" || value.feedRssOnly === "true",
      stateFile: value.feedStateFile ?? defaultStateFile,
      interests: parseList(value.feedInterests) ?? defaultInterests,
      rssFeeds,
      industrySources,
      industryStateFile: value.industryStateFile ?? defaultIndustryStateFile,
      runLogDir: value.feedRunLogDir ?? defaultRunLogDir,
      glmCodingApiKey: value.glmCodingApiKey ?? "",
      articleResearch: {
        browserChannel: value.articleBrowserChannel?.trim() || "chrome",
        browserHeadless: value.articleBrowserHeadless !== "false",
        browserTimeoutMs: articleBrowserTimeoutMs(value.articleBrowserTimeoutMs),
        glmFallback: value.articleGlmFallback === "true",
      },
      raw: env,
    } satisfies AppConfig;
  });
  return Effect.provideService(
    config,
    ConfigProvider.ConfigProvider,
    // fromEnv delegates to fromEnvRecord, which ignores undefined entries.
    ConfigProvider.fromEnv({ env: env as Record<string, string>, preserveEmptyStrings: true }),
  );
}

/** Layer CLI arguments over the environment configuration. */
export function applyCliArgs(config: AppConfig, args: CliArgs): AppConfig {
  const env = config.raw;
  const dryRun = args.dryRun === true || config.dryRun;
  return {
    ...config,
    username: args.username ?? config.username,
    githubFeedSource: args.githubFeedSource
      ? parseGithubFeedSource(args.githubFeedSource)
      : config.githubFeedSource,
    githubHomeFetch: args.githubHomeFetch
      ? parseGithubHomeFetch(args.githubHomeFetch)
      : config.githubHomeFetch,
    githubHomeStorageState: args.githubHomeStorageState ?? config.githubHomeStorageState,
    webhookUrl: dryRun ? undefined : env.NOTIFY_WEBHOOK_URL,
    outputFormat: args.json || config.outputFormat === "json" ? "json" : "markdown",
    eventPages: numberFrom(args.pages ?? env.FEED_EVENT_PAGES, 3),
    perPage: numberFrom(args.perPage ?? env.FEED_PER_PAGE, 100),
    windowHours: numberFrom(args.windowHours ?? env.FEED_WINDOW_HOURS, 36),
    since: args.since ?? env.FEED_SINCE,
    until: args.until ?? env.FEED_UNTIL,
    day: args.day ?? env.FEED_DAY,
    timezoneOffset: args.timezoneOffset ?? env.FEED_TIMEZONE_OFFSET ?? "+08:00",
    maxRepos: numberFrom(args.maxRepos ?? env.FEED_MAX_REPOS, 30),
    maxPapers: Math.min(numberFrom(args.maxPapers ?? env.FEED_MAX_PAPERS, 8), 8),
    dryRun,
    onlyNew: args.onlyNew === true || env.FEED_ONLY_NEW === "1" || env.FEED_ONLY_NEW === "true",
    rssOnly: args.rssOnly === true || env.FEED_RSS_ONLY === "1" || env.FEED_RSS_ONLY === "true",
    stateFile: args.stateFile ?? env.FEED_STATE_FILE ?? defaultStateFile,
    rssFeeds: loadFeedSubscriptions(env.RSS_FEEDS, args.rssFeedsFile ?? env.RSS_FEEDS_FILE),
    industrySources: loadIndustrySources(
      env.INDUSTRY_SOURCES ?? env.INDUSTRY_FEEDS,
      args.industrySourcesFile ??
        args.industryFeedsFile ??
        env.INDUSTRY_SOURCES_FILE ??
        env.INDUSTRY_FEEDS_FILE ??
        defaultIndustrySourcesFile(),
    ),
    industryStateFile:
      args.industryStateFile ?? env.INDUSTRY_STATE_FILE ?? defaultIndustryStateFile,
    runLogDir: args.runLogDir ?? env.FEED_RUN_LOG_DIR ?? defaultRunLogDir,
  };
}

function parseGithubFeedSource(value: string | undefined): GithubFeedSource {
  if (!value) return "home";
  if (value === "home" || value === "events") return value;
  throw new Error("GITHUB_FEED_SOURCE must be either 'home' or 'events'.");
}

function parseGithubHomeFetch(value: string | undefined): GithubHomeFetch {
  if (!value) return "conduit";
  if (value === "conduit" || value === "browser") return value;
  throw new Error("GITHUB_HOME_FETCH must be either 'conduit' or 'browser'.");
}

function numberFrom(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function articleBrowserTimeoutMs(value: string | undefined): number {
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isFinite(parsed) && parsed >= 5_000 ? parsed : 30_000;
}

function loadFeedSubscriptions(
  inlineFeeds: string | undefined,
  configuredFile: string | undefined,
): FeedSubscription[] {
  if (inlineFeeds) return decodeFeedsJson(inlineFeeds);

  const feedsFile = configuredFile ?? "feeds.json";
  if (!existsSync(feedsFile)) return [];
  return decodeFeedsJson(readFileSync(feedsFile, "utf8"));
}

function loadIndustrySources(
  inlineSources: string | undefined,
  configuredFile: string,
): IndustrySource[] {
  if (inlineSources) return decodeIndustryJson(inlineSources);
  if (!existsSync(configuredFile)) {
    throw new Error(`Industry source configuration file does not exist: ${configuredFile}`);
  }
  return decodeIndustryJson(readFileSync(configuredFile, "utf8"));
}

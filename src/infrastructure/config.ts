import { existsSync, readFileSync } from "node:fs";

import { hostnameOf } from "./parsing.js";

export type FeedSubscription = {
  name: string;
  url: string;
  tags: string[];
};

export type WebPageSubscription = {
  type: "page";
  name: string;
  url: string;
  pathPrefixes: string[];
  tags: string[];
};

export type IndustrySource = FeedSubscription | WebPageSubscription;

export type GithubFeedSource = "home" | "events";
export type GithubHomeFetch = "conduit" | "browser";

export type AppConfig = {
  username: string;
  token?: string;
  githubFeedSource: GithubFeedSource;
  githubHomeFetch: GithubHomeFetch;
  githubHomeStorageState: string;
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
};

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2),
): AppConfig {
  const args = parseArgs(argv);
  const username = args.username ?? env.GITHUB_USERNAME ?? env.GH_USERNAME ?? "PerfectPan";
  const token = env.GH_FEED_TOKEN ?? env.GITHUB_TOKEN;
  const dryRun = args.dryRun || env.DRY_RUN === "1" || env.DRY_RUN === "true";

  return {
    username,
    token,
    githubFeedSource: parseGithubFeedSource(args.githubFeedSource ?? env.GITHUB_FEED_SOURCE),
    githubHomeFetch: parseGithubHomeFetch(args.githubHomeFetch ?? env.GITHUB_HOME_FETCH),
    githubHomeStorageState:
      args.githubHomeStorageState ??
      env.GITHUB_HOME_STORAGE_STATE ??
      ".state/github-home-storage.json",
    webhookUrl: dryRun ? undefined : env.NOTIFY_WEBHOOK_URL,
    outputFormat: args.json || env.FEED_OUTPUT_FORMAT === "json" ? "json" : "markdown",
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
    onlyNew: args.onlyNew || env.FEED_ONLY_NEW === "1" || env.FEED_ONLY_NEW === "true",
    rssOnly: args.rssOnly || env.FEED_RSS_ONLY === "1" || env.FEED_RSS_ONLY === "true",
    stateFile: args.stateFile ?? env.FEED_STATE_FILE ?? ".state/feed-state.json",
    interests: parseList(env.FEED_INTERESTS) ?? [
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
    ],
    rssFeeds: loadFeedSubscriptions(env.RSS_FEEDS, args.rssFeedsFile ?? env.RSS_FEEDS_FILE),
    industrySources: loadIndustrySources(
      env.INDUSTRY_SOURCES ?? env.INDUSTRY_FEEDS,
      args.industrySourcesFile ??
        args.industryFeedsFile ??
        env.INDUSTRY_SOURCES_FILE ??
        env.INDUSTRY_FEEDS_FILE ??
        "industry-feeds.json",
    ),
    industryStateFile:
      args.industryStateFile ?? env.INDUSTRY_STATE_FILE ?? ".state/industry-state.json",
    runLogDir: args.runLogDir ?? env.FEED_RUN_LOG_DIR ?? ".state/runs",
  };
}

function parseArgs(argv: string[]) {
  const result: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (arg === "--json") {
      result.json = true;
      continue;
    }
    if (arg === "--only-new") {
      result.onlyNew = true;
      continue;
    }
    if (arg === "--rss-only") {
      result.rssOnly = true;
      continue;
    }
    if (!arg.startsWith("--")) continue;
    const key = camelCase(arg.slice(2));
    const value = argv[index + 1];
    if (value && !value.startsWith("--")) {
      result[key] = value;
      index += 1;
    }
  }
  return result as {
    username?: string;
    pages?: string;
    perPage?: string;
    windowHours?: string;
    since?: string;
    until?: string;
    day?: string;
    timezoneOffset?: string;
    maxRepos?: string;
    maxPapers?: string;
    githubFeedSource?: string;
    githubHomeFetch?: string;
    githubHomeStorageState?: string;
    rssFeedsFile?: string;
    industrySourcesFile?: string;
    industryFeedsFile?: string;
    industryStateFile?: string;
    runLogDir?: string;
    stateFile?: string;
    dryRun?: boolean;
    json?: boolean;
    onlyNew?: boolean;
    rssOnly?: boolean;
  };
}

function camelCase(value: string): string {
  return value.replace(/-([a-z])/gu, (_, char: string) => char.toUpperCase());
}

export function parseFeedSubscriptions(value: string): FeedSubscription[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("RSS feed configuration must be a JSON array.");
  }

  return parsed.map((item) => {
    if (typeof item === "string") {
      return {
        name: hostnameOf(item),
        url: item,
        tags: [],
      };
    }

    if (!item || typeof item !== "object") {
      throw new Error("Each RSS feed must be a URL string or an object.");
    }

    const record = item as Record<string, unknown>;
    if (record.type !== undefined && record.type !== "rss") {
      throw new Error("Personal feed configuration only supports RSS or Atom sources.");
    }
    return parseFeedSubscriptionRecord(record);
  });
}

export function parseIndustrySources(value: string): IndustrySource[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("Industry source configuration must be a JSON array.");
  }

  return parsed.map((item) => {
    if (typeof item === "string") {
      return {
        name: hostnameOf(item),
        url: item,
        tags: [],
      };
    }
    if (!item || typeof item !== "object") {
      throw new Error("Each industry source must be a URL string or an object.");
    }

    const record = item as Record<string, unknown>;
    if (record.type === undefined || record.type === "rss") {
      return parseFeedSubscriptionRecord(record);
    }
    if (record.type !== "page") {
      throw new Error("Industry source type must be either 'rss' or 'page'.");
    }

    const url = requireString(record.url, "Web page source url");
    ensureHttpUrl(url, "Web page source url");
    const pathPrefixes = parseStringArray(record.pathPrefixes, "Web page source pathPrefixes");
    if (pathPrefixes.length === 0 || pathPrefixes.some((prefix) => !prefix.startsWith("/"))) {
      throw new Error("Web page source pathPrefixes must contain absolute path prefixes.");
    }

    return {
      type: "page",
      name: optionalName(record.name, url),
      url,
      pathPrefixes,
      tags: parseStringArray(record.tags, "Web page source tags", false),
    };
  });
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

function loadFeedSubscriptions(
  inlineFeeds: string | undefined,
  configuredFile: string | undefined,
): FeedSubscription[] {
  if (inlineFeeds) return parseFeedSubscriptions(inlineFeeds);

  const feedsFile = configuredFile ?? "feeds.json";
  if (!existsSync(feedsFile)) return [];
  return parseFeedSubscriptions(readFileSync(feedsFile, "utf8"));
}

function loadIndustrySources(
  inlineSources: string | undefined,
  configuredFile: string,
): IndustrySource[] {
  if (inlineSources) return parseIndustrySources(inlineSources);
  if (!existsSync(configuredFile)) return [];
  return parseIndustrySources(readFileSync(configuredFile, "utf8"));
}

function parseFeedSubscriptionRecord(record: Record<string, unknown>): FeedSubscription {
  const url = requireString(record.url, "RSS feed url");
  ensureHttpUrl(url, "RSS feed url");
  return {
    name: optionalName(record.name, url),
    url,
    tags: parseStringArray(record.tags, "RSS feed tags", false),
  };
}

function optionalName(value: unknown, url: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : hostnameOf(url);
}

function parseStringArray(value: unknown, label: string, required = true): string[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function ensureHttpUrl(value: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use http or https.`);
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

import { existsSync, readFileSync } from "node:fs";

export type FeedSubscription = {
  name: string;
  url: string;
  tags: string[];
};

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
  dryRun: boolean;
  onlyNew: boolean;
  rssOnly: boolean;
  stateFile: string;
  interests: string[];
  rssFeeds: FeedSubscription[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv.slice(2)): AppConfig {
  const args = parseArgs(argv);
  const username = args.username ?? env.GITHUB_USERNAME ?? env.GH_USERNAME ?? "PerfectPan";
  const token = env.GH_FEED_TOKEN ?? env.GITHUB_TOKEN;
  const dryRun = args.dryRun || env.DRY_RUN === "1" || env.DRY_RUN === "true";

  return {
    username,
    token,
    githubFeedSource: parseGithubFeedSource(args.githubFeedSource ?? env.GITHUB_FEED_SOURCE),
    githubHomeFetch: parseGithubHomeFetch(args.githubHomeFetch ?? env.GITHUB_HOME_FETCH),
    githubHomeStorageState: args.githubHomeStorageState ?? env.GITHUB_HOME_STORAGE_STATE ?? ".state/github-home-storage.json",
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
    rssFeeds: loadFeedSubscriptions(env, args.rssFeedsFile),
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
    githubFeedSource?: string;
    githubHomeFetch?: string;
    githubHomeStorageState?: string;
    rssFeedsFile?: string;
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
        name: nameFromUrl(item),
        url: item,
        tags: [],
      };
    }

    if (!item || typeof item !== "object") {
      throw new Error("Each RSS feed must be a URL string or an object.");
    }

    const record = item as Record<string, unknown>;
    const url = requireString(record.url, "RSS feed url");
    const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : nameFromUrl(url);
    const tags = Array.isArray(record.tags)
      ? record.tags.map((tag) => (typeof tag === "string" ? tag.trim() : "")).filter(Boolean)
      : [];

    return { name, url, tags };
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

function loadFeedSubscriptions(env: NodeJS.ProcessEnv, configuredFile: string | undefined): FeedSubscription[] {
  if (env.RSS_FEEDS) return parseFeedSubscriptions(env.RSS_FEEDS);

  const feedsFile = configuredFile ?? env.RSS_FEEDS_FILE ?? "feeds.json";
  if (!existsSync(feedsFile)) return [];
  return parseFeedSubscriptions(readFileSync(feedsFile, "utf8"));
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function nameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

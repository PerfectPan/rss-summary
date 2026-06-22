export type AppConfig = {
  username: string;
  token?: string;
  webhookUrl?: string;
  eventPages: number;
  perPage: number;
  windowHours: number;
  maxRepos: number;
  dryRun: boolean;
  interests: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv.slice(2)): AppConfig {
  const args = parseArgs(argv);
  const username = args.username ?? env.GITHUB_USERNAME ?? env.GH_USERNAME ?? "PerfectPan";
  const token = env.GH_FEED_TOKEN ?? env.GITHUB_TOKEN;
  const dryRun = args.dryRun || env.DRY_RUN === "1" || env.DRY_RUN === "true";

  return {
    username,
    token,
    webhookUrl: dryRun ? undefined : env.NOTIFY_WEBHOOK_URL,
    eventPages: numberFrom(args.pages ?? env.FEED_EVENT_PAGES, 3),
    perPage: numberFrom(args.perPage ?? env.FEED_PER_PAGE, 100),
    windowHours: numberFrom(args.windowHours ?? env.FEED_WINDOW_HOURS, 36),
    maxRepos: numberFrom(args.maxRepos ?? env.FEED_MAX_REPOS, 30),
    dryRun,
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
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
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
    maxRepos?: string;
    dryRun?: boolean;
  };
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

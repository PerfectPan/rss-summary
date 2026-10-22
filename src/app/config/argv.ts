/** CLI-only argument parsing. Values keep the historical `--kebab-case` shape. */
export type CliArgs = {
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

export function parseCliArgs(argv: string[]): CliArgs {
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
  return result as CliArgs;
}

function camelCase(value: string): string {
  return value.replace(/-([a-z])/gu, (_, char: string) => char.toUpperCase());
}

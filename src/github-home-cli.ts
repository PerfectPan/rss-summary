import { saveGithubHomeStorageState } from "./github-home.js";

type Writable = {
  write(chunk: string): unknown;
};

type GithubHomeCommandDeps = {
  stdout?: Writable;
  stderr?: Writable;
};

export async function runGithubHomeCommand(argv: string[], deps: GithubHomeCommandDeps = {}): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const command = argv[0] ?? "help";
  const args = parseArgs(argv.slice(1));

  if (command === "login") {
    const storageState = args.storageState ?? process.env.GITHUB_HOME_STORAGE_STATE ?? ".state/github-home-storage.json";
    try {
      await saveGithubHomeStorageState({
        storageState,
        browserChannel: args.browserChannel ?? process.env.GITHUB_HOME_BROWSER_CHANNEL,
      });
      stdout.write(`Saved GitHub Home storage state to ${storageState}\n`);
      return 0;
    } catch (error) {
      stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }

  writeGithubHomeHelp(stdout);
  return command === "help" || command === "--help" || command === "-h" ? 0 : 1;
}

export function writeGithubHomeHelp(stdout: Writable): void {
  stdout.write(`Usage:
  rss-summary github-home login [--storage-state .state/github-home-storage.json] [--browser-channel chrome]
`);
}

function parseArgs(argv: string[]): { storageState?: string; browserChannel?: string } {
  const result: { storageState?: string; browserChannel?: string } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) continue;

    if (arg === "--storage-state") {
      result.storageState = value;
      index += 1;
    }
    if (arg === "--browser-channel") {
      result.browserChannel = value;
      index += 1;
    }
  }
  return result;
}

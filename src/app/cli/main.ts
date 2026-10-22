#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { products } from "../products/index.js";
import { runGithubHomeCommand } from "./github-home.js";
import { runRunsCommand } from "./runs.js";

type Writable = {
  write(chunk: string): unknown;
};

type CliDeps = {
  stdout?: Writable;
  stderr?: Writable;
};

export async function runCliCommand(
  argv: string[] = process.argv.slice(2),
  deps: CliDeps = {},
): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const command = argv[0] ?? "help";
  const rest = argv.slice(1);

  for (const product of products) {
    const matched = product.commands.find((entry) => entry.name === command);
    if (matched) return matched.run(rest, { stdout, stderr });
  }

  if (command === "github-home") {
    return runGithubHomeCommand(rest, deps);
  }

  if (command === "runs") {
    return runRunsCommand(rest, { stdout, stderr });
  }

  if (command === "help" || command === "--help" || command === "-h") {
    writeHelp(stdout);
    return 0;
  }

  writeHelp(stdout);
  return 1;
}

function writeHelp(stdout: Writable): void {
  stdout.write(`Usage:
  rss-summary digest [--rss-only] [digest options]
  rss-summary github-home login [--storage-state .state/github-home-storage.json]
  rss-summary feeds add --url <rss-url> [--name <name>] [--tags ai,mcp]
  rss-summary feeds remove --url <rss-url>
  rss-summary feeds delete --url <rss-url>
  rss-summary feeds list
  rss-summary feeds test
  rss-summary research add [--file <path>] [--state-file .state/feed-state.json]
  rss-summary runs list|failures
  rss-summary runs show <artifact-path-or-label>
  rss-summary industry [--json] [--day YYYY-MM-DD] [--only-new] [--dry-run]
`);
}

export function isCliEntrypoint(metaUrl: string, argvPath: string | undefined): boolean {
  if (!argvPath) return false;
  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(argvPath);
  } catch {
    return fileURLToPath(metaUrl) === argvPath;
  }
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  process.exitCode = await runCliCommand();
}

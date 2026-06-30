#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { run as runDigest } from "./main.js";
import { runFeedsCommand } from "./feeds.js";
import { runGithubHomeCommand } from "./github-home-cli.js";

type Writable = {
  write(chunk: string): unknown;
};

type CliDeps = {
  stdout?: Writable;
  stderr?: Writable;
};

export async function runCliCommand(argv: string[] = process.argv.slice(2), deps: CliDeps = {}): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const command = argv[0] ?? "help";
  const rest = argv.slice(1);

  if (command === "feeds") {
    return runFeedsCommand(rest, deps);
  }

  if (command === "github-home") {
    return runGithubHomeCommand(rest, deps);
  }

  if (command === "digest") {
    await runDigest();
    return 0;
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

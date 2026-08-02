#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";

import { run as runDigest } from "../application/digest.js";
import { renderJsonDigest, renderMarkdownDigest } from "./render.js";
import { runFeedsCommand } from "./feeds-cli.js";
import { runGithubHomeCommand } from "./github-home-cli.js";
import { runSignalCommand } from "./signal-cli.js";

type Writable = {
  write(chunk: string): unknown;
};

type CliDeps = {
  stdout?: Writable;
  stderr?: Writable;
  signal?: {
    generate?: (
      input: unknown,
      deps?: { env?: NodeJS.ProcessEnv },
    ) => Promise<import("../application/signal-brief.js").SignalBriefOutput>;
  };
};

export async function runCliCommand(argv: string[] = process.argv.slice(2), deps: CliDeps = {}): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const command = argv[0] ?? "help";
  const rest = argv.slice(1);

  if (command === "feeds") {
    return runFeedsCommand(rest, deps);
  }

  if (command === "github-home") {
    return runGithubHomeCommand(rest, deps);
  }

  if (command === "signal") {
    return runSignalCommand(rest, { stdout, stderr, generate: deps.signal?.generate });
  }

  if (command === "digest") {
    try {
      await Effect.runPromise(
        runDigest((document, format) =>
          format === "json" ? renderJsonDigest(document) : renderMarkdownDigest(document),
        ),
      );
      return 0;
    } catch (error) {
      stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
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
  rss-summary signal [--day YYYY-MM-DD] [--occurrence <iso-date-time>] [--dry-run]
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

#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";

import { run as runDigest } from "../application/digest.js";
import { runIndustry } from "../application/industry-brief.js";
import { renderJsonDigest, renderMarkdownDigest } from "./render.js";
import { renderJsonIndustryBrief, renderMarkdownIndustryBrief } from "./industry-render.js";
import { runFeedsCommand } from "./feeds-cli.js";
import { runGithubHomeCommand } from "./github-home-cli.js";
import { runResearchCommand } from "./research-cli.js";
import { runRunsCommand } from "./runs-cli.js";
import { errorMessage } from "../infrastructure/parsing.js";

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

  if (command === "feeds") {
    return runFeedsCommand(rest, deps);
  }

  if (command === "github-home") {
    return runGithubHomeCommand(rest, deps);
  }

  if (command === "research") {
    return runResearchCommand(rest, { stdout, stderr });
  }

  if (command === "runs") {
    return runRunsCommand(rest, { stdout, stderr });
  }

  if (command === "industry") {
    try {
      await Effect.runPromise(
        runIndustry((document, format) =>
          format === "json"
            ? renderJsonIndustryBrief(document)
            : renderMarkdownIndustryBrief(document),
        ),
      );
      return 0;
    } catch (error) {
      stderr.write(`${errorMessage(error)}\n`);
      return 1;
    }
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
      stderr.write(`${errorMessage(error)}\n`);
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

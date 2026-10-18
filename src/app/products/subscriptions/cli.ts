import { Effect } from "effect";

import { parseCliArgs } from "../../config/argv.js";
import { applyCliArgs, loadEnvConfig } from "../../config/env.js";
import { appLayerFromConfig } from "../../layers.js";
import { runCliEffect } from "../../runtime.js";
import { digestView, renderJsonDigest } from "../../render/layouts/digest.js";
import { renderViewMarkdown } from "../../render/markdown.js";
import { runSubscriptionFlow } from "./flow.js";

type Writable = {
  write(chunk: string): unknown;
};

/** `rss-summary digest [--rss-only] [digest options]` */
export async function runDigestCommand(
  argv: string[],
  deps: { stdout?: Writable; stderr?: Writable } = {},
): Promise<number> {
  const stderr = deps.stderr ?? process.stderr;
  const config = Effect.map(loadEnvConfig(), (base) => applyCliArgs(base, parseCliArgs(argv)));
  return runCliEffect(
    Effect.flatMap(config, (resolved) =>
      runSubscriptionFlow(resolved, (document, format) =>
        format === "json" ? renderJsonDigest(document) : renderViewMarkdown(digestView(document)),
      ),
    ),
    { stderr, layer: appLayerFromConfig(config) },
  );
}

import type { FeedSubscription } from "../../../acquisition/index.js";
import { type ActivityCard } from "../../../editorial/index.js";
import {
  RssClient,
  addCatalogFeed,
  addFeedSubscription,
  listCatalogFeeds,
  removeCatalogFeed,
} from "../../../acquisition/index.js";
import { errorMessage } from "../../../kernel/index.js";
import { runPluginEffect } from "../../runtime.js";

type FeedsCommandDeps = {
  stdout?: Writable;
  stderr?: Writable;
  rssClient?: Pick<RssClient, "getFeedEvents">;
};

type ParsedArgs = {
  command: string;
  file: string;
  name?: string;
  url?: string;
  tags: string[];
};

export async function runFeedsCommand(
  argv: string[] = process.argv.slice(2),
  deps: FeedsCommandDeps = {},
): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  try {
    const args = parseArgs(argv);
    if (args.command === "add") {
      const feeds = await runPluginEffect(addCatalogFeed(args.file, requireFeedInput(args)));
      const added = feeds.at(-1);
      stdout.write(`Added ${added?.name ?? args.url} -> ${added?.url ?? args.url}\n`);
      return 0;
    }

    if (args.command === "list") {
      writeFeedList(stdout, await runPluginEffect(listCatalogFeeds(args.file)), args.file);
      return 0;
    }

    if (args.command === "remove" || args.command === "delete") {
      await runPluginEffect(removeCatalogFeed(args.file, requireUrl(args)));
      stdout.write(`Removed ${args.url}\n`);
      return 0;
    }

    if (args.command === "test") {
      await testFeeds(stdout, await loadFeedsForTest(args), deps.rssClient ?? new RssClient());
      return 0;
    }

    writeHelp(stdout);
    return args.command === "help" ? 0 : 1;
  } catch (error) {
    stderr.write(`${errorMessage(error)}\n`);
    return 1;
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] ?? "help";
  const options: Record<string, string> = {};

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${arg} requires a value.`);
    }
    options[camelCase(arg.slice(2))] = value;
    index += 1;
  }

  return {
    command,
    file: options.file ?? "feeds.json",
    name: options.name,
    url: options.url,
    tags: parseTags(options.tags),
  };
}

function requireFeedInput(args: ParsedArgs): { name?: string; url: string; tags: string[] } {
  const url = requireUrl(args);
  return {
    name: args.name,
    url,
    tags: args.tags,
  };
}

function requireUrl(args: ParsedArgs): string {
  if (!args.url) throw new Error("--url is required.");
  return args.url;
}

async function loadFeedsForTest(args: ParsedArgs): Promise<FeedSubscription[]> {
  if (args.url) return addFeedSubscription([], requireFeedInput(args));
  return runPluginEffect(listCatalogFeeds(args.file));
}

function writeFeedList(stdout: Writable, feeds: FeedSubscription[], file: string): void {
  if (feeds.length === 0) {
    stdout.write(`No RSS feeds configured in ${file}\n`);
    return;
  }

  for (const feed of feeds) {
    stdout.write(`${feed.name}\t${feed.url}\t${feed.tags.join(", ")}\n`);
  }
}

async function testFeeds(
  stdout: Writable,
  feeds: FeedSubscription[],
  rssClient: Pick<RssClient, "getFeedEvents">,
): Promise<void> {
  if (feeds.length === 0) {
    stdout.write("No RSS feeds to test.\n");
    return;
  }

  for (const feed of feeds) {
    const events = await rssClient.getFeedEvents(feed);
    stdout.write(`${feed.name}: ok, ${events.length} ${pluralize("item", events)}\n`);
  }
}

function writeHelp(stdout: Writable): void {
  stdout.write(`Usage:
  rss-summary feeds add --url <rss-url> [--name <name>] [--tags ai,mcp] [--file feeds.json]
  rss-summary feeds remove --url <rss-url> [--file feeds.json]
  rss-summary feeds delete --url <rss-url> [--file feeds.json]
  rss-summary feeds list [--file feeds.json]
  rss-summary feeds test [--file feeds.json]
  rss-summary feeds test --url <rss-url> [--name <name>] [--tags ai,mcp]
`);
}

function parseTags(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function pluralize(label: string, events: ActivityCard[]): string {
  return events.length === 1 ? label : `${label}s`;
}

function camelCase(value: string): string {
  return value.replace(/-([a-z])/gu, (_, char: string) => char.toUpperCase());
}

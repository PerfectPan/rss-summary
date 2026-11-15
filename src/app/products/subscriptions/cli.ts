import type { Acquired, FeedSubscription } from "../../../acquisition/index.js";
import {
  addCatalogFeed,
  addFeedSubscription,
  listCatalogFeeds,
  removeCatalogFeed,
  RssFeed
} from "../../../acquisition/index.js";
import { runPluginEffect } from "../../runtime.js";
import { digestView, renderJsonDigest } from "../../render/layouts/digest.js";
import { renderViewMarkdown } from "../../render/markdown.js";
import { parseCommandOptions, runCliCommand, runProductCommand, type Writable } from "../shared/cli.js";
import { runSubscriptionFlow } from "./flow.js";

/** `rss-summary digest [--rss-only] [digest options]` */
export async function runDigestCommand(
  argv: string[],
  deps: { stdout?: Writable; stderr?: Writable } = {}
): Promise<number> {
  return runProductCommand(argv, deps, (resolved) =>
    runSubscriptionFlow(resolved, (document, format) =>
      format === "json" ? renderJsonDigest(document) : renderViewMarkdown(digestView(document))
    )
  );
}

type FeedsCommandDeps = {
  stdout?: Writable;
  stderr?: Writable;
  fetchFeedEvents?: (feed: FeedSubscription) => Promise<Acquired[]>;
};

type ParsedArgs = {
  command: string;
  file: string;
  name?: string;
  url?: string;
  tags: string[];
};

function parseTags(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseArgs(argv: string[]): ParsedArgs {
  const { command, options } = parseCommandOptions(argv);
  return {
    command,
    file: options.file ?? "feeds.json",
    name: options.name,
    url: options.url,
    tags: parseTags(options.tags)
  };
}

function requireUrl(args: ParsedArgs): string {
  if (!args.url) {
    throw new Error("--url is required.");
  }
  return args.url;
}

function requireFeedInput(args: ParsedArgs): { name?: string; url: string; tags: string[] } {
  const url = requireUrl(args);
  return {
    name: args.name,
    url,
    tags: args.tags
  };
}

async function loadFeedsForTest(args: ParsedArgs): Promise<FeedSubscription[]> {
  if (args.url) {
    return addFeedSubscription([], requireFeedInput(args));
  }
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

function pluralize(label: string, events: Acquired[]): string {
  return events.length === 1 ? label : `${label}s`;
}

async function testFeeds(
  stdout: Writable,
  feeds: FeedSubscription[],
  fetchFeedEvents: (feed: FeedSubscription) => Promise<Acquired[]>
): Promise<void> {
  if (feeds.length === 0) {
    stdout.write("No RSS feeds to test.\n");
    return;
  }

  for (const feed of feeds) {
    const events = await fetchFeedEvents(feed);
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

export async function runFeedsCommand(
  argv: string[] = process.argv.slice(2),
  deps: FeedsCommandDeps = {}
): Promise<number> {
  return runCliCommand(deps, async (stdout) => {
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
      const fetchFeedEvents =
        deps.fetchFeedEvents ??
        ((feed: FeedSubscription) => runPluginEffect(RssFeed.use((rss) => rss.getFeedEvents(feed))));
      await testFeeds(stdout, await loadFeedsForTest(args), fetchFeedEvents);
      return 0;
    }

    writeHelp(stdout);
    return args.command === "help" ? 0 : 1;
  });
}

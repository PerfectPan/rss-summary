import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { parseFeedSubscriptions, type FeedSubscription } from "./config.js";

export type FeedSubscriptionInput = {
  name?: string;
  url: string;
  tags?: string[];
};

export function addFeedSubscription(
  feeds: FeedSubscription[],
  input: FeedSubscriptionInput,
): FeedSubscription[] {
  const next = normalizeFeedSubscription(input);
  if (feeds.some((feed) => feed.url === next.url)) {
    throw new Error(`RSS feed already exists: ${next.url}`);
  }
  return [...feeds, next];
}

export function loadFeedFile(path: string): FeedSubscription[] {
  if (!existsSync(path)) return [];
  return parseFeedSubscriptions(readFileSync(path, "utf8"));
}

export function saveFeedFile(path: string, feeds: FeedSubscription[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, formatFeedSubscriptions(feeds));
}

export function formatFeedSubscriptions(feeds: FeedSubscription[]): string {
  return `${JSON.stringify(feeds, null, 2)}\n`;
}

function normalizeFeedSubscription(input: FeedSubscriptionInput): FeedSubscription {
  const url = input.url.trim();
  if (!url) throw new Error("RSS feed url is required.");

  return {
    name: input.name?.trim() || nameFromUrl(url),
    url,
    tags: unique((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean)),
  };
}

function nameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

import { XMLParser } from "fast-xml-parser";

import type { FeedSubscription } from "./config.js";
import type { ActivityCard } from "./domain.js";

type RssClientOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type XmlRecord = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  removeNSPrefix: true,
  trimValues: true,
});

export class RssClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: RssClientOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 12_000;
  }

  async getFeedEvents(feed: FeedSubscription): Promise<ActivityCard[]> {
    const response = await this.fetchImpl(feed.url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        "user-agent": "rss-summary/0.1",
      },
    });
    if (!response.ok) {
      throw new Error(`RSS feed ${feed.name} returned ${response.status}`);
    }

    return parseFeedXml(await response.text(), feed);
  }
}

export function parseFeedXml(xml: string, feed: FeedSubscription): ActivityCard[] {
  const root = asRecord(parser.parse(xml));
  const rssChannel = asRecord(asRecord(root.rss).channel);
  if (Object.keys(rssChannel).length > 0) {
    return toArray(rssChannel.item).map((item) => normalizeRssItem(asRecord(item), feed));
  }

  const atomFeed = asRecord(root.feed);
  if (Object.keys(atomFeed).length > 0) {
    return toArray(atomFeed.entry).map((entry) => normalizeAtomEntry(asRecord(entry), feed));
  }

  return [];
}

function normalizeRssItem(item: XmlRecord, feed: FeedSubscription): ActivityCard {
  const title = text(item.title);
  const htmlUrl = text(item.link);
  const guid = text(item.guid) ?? htmlUrl ?? title ?? "untitled";
  const summary = cleanSummary(text(item.description) ?? text(item.encoded));
  const createdAt = normalizeDate(text(item.pubDate) ?? text(item.date));

  return {
    id: `rss:${feed.url}:${guid}`,
    type: "article",
    source: "rss",
    actor: feed.name,
    repo: `rss:${htmlUrl ?? guid}`,
    createdAt,
    action: "published",
    htmlUrl,
    title,
    summary,
    sourceName: feed.name,
    sourceUrl: feed.url,
    tags: feed.tags,
  };
}

function normalizeAtomEntry(entry: XmlRecord, feed: FeedSubscription): ActivityCard {
  const title = text(entry.title);
  const htmlUrl = atomLink(entry.link);
  const id = text(entry.id) ?? htmlUrl ?? title ?? "untitled";
  const summary = cleanSummary(text(entry.summary) ?? text(entry.content));
  const createdAt = normalizeDate(text(entry.updated) ?? text(entry.published));

  return {
    id: `rss:${feed.url}:${id}`,
    type: "article",
    source: "rss",
    actor: feed.name,
    repo: `rss:${htmlUrl ?? id}`,
    createdAt,
    action: "published",
    htmlUrl,
    title,
    summary,
    sourceName: feed.name,
    sourceUrl: feed.url,
    tags: feed.tags,
  };
}

function atomLink(value: unknown): string | undefined {
  const links = toArray(value);
  const alternate = links
    .map(asRecord)
    .find((link) => text(link["@_rel"]) === "alternate" || !text(link["@_rel"]));
  return text(alternate?.["@_href"]) ?? text(value);
}

function normalizeDate(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : new Date().toISOString();
}

function text(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") return String(value);
  const record = asRecord(value);
  const textNode = record["#text"];
  if (typeof textNode === "string" || typeof textNode === "number") return String(textNode);
  return undefined;
}

function cleanSummary(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const stripped = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return decodeHtmlEntities(stripped);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&#(\d+);/gu, (_, codepoint: string) => String.fromCodePoint(Number(codepoint)))
    .replace(/&#x([0-9a-f]+);/giu, (_, codepoint: string) => String.fromCodePoint(Number.parseInt(codepoint, 16)));
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined ? [] : [value];
}

function asRecord(value: unknown): XmlRecord {
  return value && typeof value === "object" ? (value as XmlRecord) : {};
}

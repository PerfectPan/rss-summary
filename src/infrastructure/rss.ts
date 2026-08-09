import { XMLParser } from "fast-xml-parser";
import he from "he";
import castArray from "lodash-es/castArray.js";

import type { ActivityCard } from "../domain/digest.js";
import type { FeedSubscription } from "./config.js";
import { asRecord } from "./parsing.js";

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
        accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
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
    return xmlChildren(rssChannel.item).map((item) => normalizeRssItem(asRecord(item), feed));
  }

  const atomFeed = asRecord(root.feed);
  if (Object.keys(atomFeed).length > 0) {
    return xmlChildren(atomFeed.entry).map((entry) => normalizeAtomEntry(asRecord(entry), feed));
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
    type: publicationType(htmlUrl, feed),
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
  const createdAt = normalizeDate(text(entry.published) ?? text(entry.updated));

  return {
    id: `rss:${feed.url}:${id}`,
    type: publicationType(htmlUrl, feed),
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

function publicationType(
  htmlUrl: string | undefined,
  feed: FeedSubscription,
): "article" | "paper" | "release" {
  const tags = new Set(feed.tags.map((tag) => tag.toLowerCase()));
  if (tags.has("papers") || tags.has("academic")) return "paper";
  if (tags.has("releases")) return "release";

  const hostnames = [htmlUrl, feed.url]
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      try {
        return new URL(value).hostname.toLowerCase();
      } catch {
        return "";
      }
    });
  return hostnames.some((hostname) => hostname === "arxiv.org" || hostname.endsWith(".arxiv.org"))
    ? "paper"
    : "article";
}

function atomLink(value: unknown): string | undefined {
  const links = xmlChildren(value);
  const alternate = links
    .map((link) => asRecord(link))
    .find((link) => text(link["@_rel"]) === "alternate" || !text(link["@_rel"]));
  return text(alternate?.["@_href"]) ?? text(value);
}

/** XML nodes: missing → [], single → [node], list → list (lodash castArray + undefined guard). */
function xmlChildren(value: unknown): unknown[] {
  if (value === undefined) return [];
  return castArray(value);
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
  // Strip markup first, then decode entities (&amp; → &, &#x…; → chars) via `he`.
  const stripped = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return he.decode(stripped);
}

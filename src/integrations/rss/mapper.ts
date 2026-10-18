import he from "he";

import type { Acquired, ActivityCardDto } from "../../acquisition/index.js";
import type { FeedSubscription } from "../../acquisition/index.js";

import { publicationAcquired } from "../shared/activity-card.js";
import { asRecord, text, xmlChildren, xmlFeed, type XmlRecord } from "./dto.js";

export function parseFeed(xml: string, feed: FeedSubscription, now: Date): Acquired[] {
  return parseFeedXml(xml, feed, now).map((card) => publicationAcquired(card));
}

export function parseFeedXml(xml: string, feed: FeedSubscription, now: Date): ActivityCardDto[] {
  const { channelItems, atomEntries } = xmlFeed(xml);
  return [
    ...channelItems.map((item) => normalizeRssItem(item, feed, now)),
    ...atomEntries.map((entry) => normalizeAtomEntry(entry, feed, now)),
  ];
}

function normalizeRssItem(item: XmlRecord, feed: FeedSubscription, now: Date): ActivityCardDto {
  const title = text(item.title);
  const htmlUrl = text(item.link);
  const guid = text(item.guid) ?? htmlUrl ?? title ?? "untitled";
  const summary = chooseRicherSummary(
    cleanSummary(text(item.description)),
    cleanSummary(text(item.encoded)),
  );
  const createdAt = normalizeDate(text(item.pubDate) ?? text(item.date), now);

  return {
    id: `rss:${feed.url}:${guid}`,
    type: rssPublicationType(htmlUrl, feed),
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

function chooseRicherSummary(
  description: string | undefined,
  encoded: string | undefined,
): string | undefined {
  if (!description) return encoded;
  if (!encoded) return description;
  return encoded.length > description.length ? encoded : description;
}

function normalizeAtomEntry(entry: XmlRecord, feed: FeedSubscription, now: Date): ActivityCardDto {
  const title = text(entry.title);
  const htmlUrl = atomLink(entry.link);
  const id = text(entry.id) ?? htmlUrl ?? title ?? "untitled";
  const summary = cleanSummary(text(entry.summary) ?? text(entry.content));
  const createdAt = normalizeDate(text(entry.published) ?? text(entry.updated), now);

  return {
    id: `rss:${feed.url}:${id}`,
    type: rssPublicationType(htmlUrl, feed),
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
  const links = xmlChildren(value);
  const alternate = links
    .map((link) => asRecord(link))
    .find((link) => text(link["@_rel"]) === "alternate" || !text(link["@_rel"]));
  return text(alternate?.["@_href"]) ?? text(value);
}

function normalizeDate(value: string | undefined, now: Date): string {
  if (!value) return now.toISOString();
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : now.toISOString();
}

function cleanSummary(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // Strip markup first, then decode entities (&amp; → &, &#x…; → chars) via `he`.
  const stripped = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/(^|\n)\s*#{1,6}\s*/gu, "$1")
    .replace(/[\\*_`]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return cleanBoilerplate(he.decode(stripped));
}

function cleanBoilerplate(value: string): string | undefined {
  const promotional =
    /^(?:AI资讯日报|AI资讯|每日早读|全网数据聚合|前沿科学探索|行业自由发声|开源创新力量|AI与人类未来|访问网页版|进群交流)$/iu;
  const cleaned = value
    .split(/\s*[|｜]\s*/u)
    .filter((part) => !promotional.test(part.trim()))
    .join(" ")
    .replace(/^(?:AI资讯日报\s*\d{4}[/.年-]\d{1,2}[/.月-]\d{1,2}日?\s*)?/iu, "")
    .replace(/(?:订阅我们|关注我们|扫码关注|加入社群|进群交流)[^。！？!?]*[。！？!?]?/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const summaryMarker = /(?:^|\s)(?:今日摘要|今日要闻)\s*[:：]?\s*/u.exec(cleaned);
  const withoutHeader = summaryMarker
    ? cleaned.slice(summaryMarker.index + summaryMarker[0].length)
    : cleaned;
  const withoutFooter = withoutHeader.split(/\s*AI资讯日报多渠道\s*/u, 1)[0]?.trim() ?? "";
  return withoutFooter || undefined;
}

/**
 * Item classification for a feed entry: the configured tags decide first, then
 * the academic-host convention (arXiv hosts publish papers). Academic hosts
 * are checked on the entry URL and the feed URL; a releases tag wins only
 * when the entry is not academic.
 */
export function rssPublicationType(
  htmlUrl: string | undefined,
  feed: Pick<FeedSubscription, "tags" | "url">,
): "article" | "paper" | "release" {
  const tags = new Set(feed.tags.map((tag) => tag.toLowerCase()));
  if (tags.has("papers") || tags.has("academic")) return "paper";
  if (tags.has("releases")) return "release";
  return hostIsAcademic(htmlUrl) || hostIsAcademic(feed.url) ? "paper" : "article";
}

/** Source exclusion before a fetch: an arXiv host or a paper tag marks the source. */
export function isDailyAiPaperSource(source: { url: string; tags: readonly string[] }): boolean {
  const hostname = new URL(source.url).hostname;
  return (
    hostname === "arxiv.org" ||
    hostname.endsWith(".arxiv.org") ||
    source.tags.some((tag) => {
      const normalized = tag.toLowerCase();
      return normalized === "papers" || normalized === "academic";
    })
  );
}

function hostIsAcademic(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "arxiv.org" || hostname.endsWith(".arxiv.org");
  } catch {
    return false;
  }
}

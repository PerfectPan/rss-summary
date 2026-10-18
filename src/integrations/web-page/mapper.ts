import type { Acquired, ActivityCardDto, WebPageSubscription } from "../../acquisition/index.js";
import { listingPublicationType } from "../../acquisition/index.js";

import { publicationAcquired } from "../shared/activity-card.js";
import { decodeEntry, extractWebPageEntries, type WebPageEntry } from "./dto.js";

export function acquireWebPage(html: string, source: WebPageSubscription): Acquired[] {
  return extractWebPageEntries(html, source).flatMap((entry) => {
    const decoded = decodeEntry(entry);
    if (!decoded) return [];
    return [publicationAcquired(normalizeWebPageEntry(decoded, source))];
  });
}

export function normalizeWebPageEntry(
  entry: WebPageEntry,
  source: WebPageSubscription,
): ActivityCardDto {
  return {
    id: `web:${source.url}:${entry.url}`,
    type: listingPublicationType(source.tags),
    source: "web",
    actor: source.name,
    repo: `web:${entry.url}`,
    createdAt: entry.publishedAt,
    action: "published",
    htmlUrl: entry.url,
    title: entry.title,
    summary: entry.summary,
    sourceName: source.name,
    sourceUrl: source.url,
    tags: source.tags,
  };
}

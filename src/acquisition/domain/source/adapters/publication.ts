import type { FeedSubscription } from "../subscription.js";

export type PublicationKind = "article" | "paper" | "release";

/**
 * Item classification for a feed entry. Academic hosts are checked on the entry
 * URL and the feed URL. A releases tag wins only when the entry is not academic.
 */
export function rssPublicationType(
  htmlUrl: string | undefined,
  feed: Pick<FeedSubscription, "tags" | "url">,
): PublicationKind {
  const tags = new Set(feed.tags.map((tag) => tag.toLowerCase()));
  if (tags.has("papers") || tags.has("academic")) return "paper";
  if (tags.has("releases")) return "release";
  return hostIsAcademic(htmlUrl) || hostIsAcademic(feed.url) ? "paper" : "article";
}

/** Listing pages classify from tags only. An academic host without those tags stays an article. */
export function listingPublicationType(tags: readonly string[]): PublicationKind {
  const normalized = new Set(tags.map((tag) => tag.toLowerCase()));
  if (normalized.has("papers") || normalized.has("academic")) return "paper";
  if (normalized.has("releases")) return "release";
  return "article";
}

/**
 * Source exclusion before a fetch. This looks at the source URL only, and a
 * releases tag does not exclude the source.
 */
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

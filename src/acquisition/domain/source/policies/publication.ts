export type PublicationKind = "article" | "paper" | "release";

/**
 * Item classification for a listing page: tags only. An academic host without
 * those tags stays an article (feed entries apply the host rule; see the feed
 * service's mapper).
 */
export function listingPublicationType(tags: readonly string[]): PublicationKind {
  const normalized = new Set(tags.map((tag) => tag.toLowerCase()));
  if (normalized.has("papers") || normalized.has("academic")) return "paper";
  if (normalized.has("releases")) return "release";
  return "article";
}

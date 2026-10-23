import type { CredibilityTier, Item } from "../../acquisition/index.js";
import type { SearchSourcePolicy, SearchResult } from "../../acquisition/index.js";

/**
 * A provider authority score (0–4, `-1` unknown): 3 and above is highly
 * authoritative, every other value stays unrated. The scale has no official
 * level, so a result carrying such a score is never official.
 */
export function credibilityForAuthority(authority: number | undefined): {
  tier: CredibilityTier;
} {
  if (authority !== undefined && authority >= 3) return { tier: "authoritative" };
  return { tier: "unrated" };
}

/**
 * The search endpoint has no official-source filter: results carry a
 * 0–4 authority score at best. Only news and authoritative queries may use it.
 */
export const deepSeekSourcePolicies: readonly SearchSourcePolicy[] = ["news", "authoritative"];

export function itemFromDeepSeek(result: SearchResult): Item {
  const published = result.publishTime;
  return {
    id: result.id,
    kind: "publication",
    subject: {
      key: result.url,
      name: result.siteName ?? result.url,
      url: result.url,
    },
    content: {
      title: result.title,
      ...(result.summary || result.snippet ? { excerpt: result.summary ?? result.snippet } : {}),
      url: result.url,
    },
    publishedAt: {
      value: published ?? "",
      // The endpoint returns RFC 3339 instants; only a missing date degrades.
      precision: published ? "instant" : "date",
    },
    provenance: { origin: result.url },
    credibility: credibilityForAuthority(result.authority),
    signals: [],
    rank: {
      position: result.rankPosition,
      ...(result.rankScore !== undefined ? { score: result.rankScore } : {}),
    },
    display: {
      ...(result.siteName ? { label: result.siteName } : {}),
      reference: result.url,
      facts: [],
    },
  };
}

import type { CredibilityTier, Item } from "../../acquisition/index.js";
import type { SearchResult } from "../../acquisition/index.js";
import { itemFromPublication } from "../shared/search-item.js";

/**
 * Authority levels follow the news score table: 1 is an official source,
 * 2 is authoritative, and every other level stays unrated.
 * @internal
 */
export function credibilityForAuthLevel(level: number | undefined): { tier: CredibilityTier } {
  if (level === 1) {
    return { tier: "official" };
  }
  if (level === 2) {
    return { tier: "authoritative" };
  }
  return { tier: "unrated" };
}

export function itemFromDoubao(result: SearchResult): Item {
  const published = result.publishTime;
  return itemFromPublication(result, {
    publishedAt: {
      value: published ?? "",
      precision: published && published.includes("T") ? "instant" : "date"
    },
    provenance: {
      origin: result.url,
      ...(result.authInfoDescription ? { note: result.authInfoDescription } : {})
    },
    credibility: credibilityForAuthLevel(result.authInfoLevel),
    rankScore: result.rankScore
  });
}

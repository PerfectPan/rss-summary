import type { CredibilityTier, Item } from "../../acquisition/index.js";
import type { SearchResult } from "../../acquisition/index.js";

/**
 * Authority levels follow the news score table: 1 is an official source,
 * 2 is authoritative, and every other level stays unrated.
 */
export function credibilityForAuthLevel(level: number | undefined): { tier: CredibilityTier } {
  if (level === 1) return { tier: "official" };
  if (level === 2) return { tier: "authoritative" };
  return { tier: "unrated" };
}

export function itemFromDoubao(result: SearchResult): Item {
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
      precision: published && published.includes("T") ? "instant" : "date",
    },
    provenance: {
      origin: result.url,
      ...(result.authInfoDescription ? { note: result.authInfoDescription } : {}),
    },
    credibility: credibilityForAuthLevel(result.authInfoLevel),
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

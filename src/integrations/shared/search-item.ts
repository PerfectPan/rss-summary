import type { CredibilityTier, Item, SearchResult } from "../../acquisition/index.js";

/** The excerpt a publication result carries: its summary, or its snippet when the summary is missing. */
function searchResultExcerpt(result: SearchResult): string | undefined {
  return result.summary ?? result.snippet;
}

/** The `Item` shape every search provider maps a result into. */
export function itemFromSearchResult(
  result: SearchResult,
  options: {
    kind: "publication" | "post";
    excerpt?: string | undefined;
    publishedAt: Item["publishedAt"];
    provenance: Item["provenance"];
    credibility: { tier: CredibilityTier };
    rankScore?: number | undefined;
  }
): Item {
  return {
    id: result.id,
    kind: options.kind,
    subject: {
      key: result.url,
      name: result.siteName ?? result.url,
      url: result.url
    },
    content: {
      title: result.title,
      ...(options.excerpt ? { excerpt: options.excerpt } : {}),
      url: result.url
    },
    publishedAt: options.publishedAt,
    provenance: options.provenance,
    credibility: options.credibility,
    signals: [],
    rank: {
      position: result.rankPosition,
      ...(options.rankScore !== undefined ? { score: options.rankScore } : {})
    },
    display: {
      ...(result.siteName ? { label: result.siteName } : {}),
      reference: result.url,
      facts: []
    }
  };
}

/** The publication `Item` a provider result maps into; the precision, provenance and credibility stay the provider's. */
export function itemFromPublication(
  result: SearchResult,
  options: {
    publishedAt: Item["publishedAt"];
    provenance: Item["provenance"];
    credibility: { tier: CredibilityTier };
    rankScore?: number | undefined;
  }
): Item {
  return itemFromSearchResult(result, {
    kind: "publication",
    excerpt: searchResultExcerpt(result),
    publishedAt: options.publishedAt,
    provenance: options.provenance,
    credibility: options.credibility,
    rankScore: options.rankScore
  });
}

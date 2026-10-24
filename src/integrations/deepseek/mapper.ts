import type {
  CredibilityTier,
  Item,
  SearchSourcePolicy,
  SearchResult,
} from "../../acquisition/index.js";
import type { PublicationDay } from "../../kernel/index.js";
import { shiftCalendarDay } from "../../kernel/index.js";

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

/**
 * The endpoint serializes date-granular publications as the UTC rendering of a
 * Beijing midnight (`D T16:00:00Z` is midnight of the next Beijing day), so a
 * matching value only establishes that Beijing calendar day. Timestamps with a
 * real time-of-day stay instants.
 */
export function deepSeekPublicationDay(publishTime: string): PublicationDay | undefined {
  const match = /^(\d{4}-\d{2}-\d{2})T16:00:00(?:\.000)?Z$/u.exec(publishTime);
  if (!match) return undefined;
  return { day: shiftCalendarDay(match[1]!, 1), timezoneOffset: "+08:00" };
}

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
      precision: published ? (result.publishDay ? "date" : "instant") : "date",
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

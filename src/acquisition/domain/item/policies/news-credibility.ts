import type { CredibilityMethod, CredibilityTier } from "../index.js";
import type { SourceVerification } from "../../search/index.js";

/**
 * Provider certificates resolved before an editorial rule sees a hit.
 * `rank` preserves the historical story field; `tier` is what the rule reads.
 */
export type ResolvedNewsCredibility = {
  tier: CredibilityTier;
  method?: CredibilityMethod;
  rank: number;
};

export function resolveNewsCredibility(input: {
  url: string;
  authInfoLevel?: number;
  authority?: number;
  sourceVerification?: SourceVerification;
}): ResolvedNewsCredibility {
  if (input.sourceVerification) {
    const method = input.sourceVerification.method;
    if (method === "article-read") return certified(4, method);
    let host: string;
    try {
      host = new URL(input.url).hostname;
    } catch {
      return certified(4, method);
    }
    const { domain, policy } = input.sourceVerification;
    if (host !== domain && !host.endsWith(`.${domain}`)) return certified(4, method);
    return certified(policy === "official" ? 1 : 2, method);
  }
  // Authority-score providers never reach the authInfoLevel scale; their rank
  // lands on the historical levels (2 authoritative, 4 unrated) for scoring.
  // The 3-and-above threshold is the `SearchResult.authority` field contract;
  // each search integration maps its own authority field onto the same tiers.
  if (input.authority !== undefined) {
    const authoritative = input.authority >= 3;
    return { tier: authoritative ? "authoritative" : "unrated", rank: authoritative ? 2 : 4 };
  }
  return certified(input.authInfoLevel ?? 4);
}

function certified(rank: number, method?: CredibilityMethod): ResolvedNewsCredibility {
  // The numeric authority-rank table mirrors the news score table: 1 is an
  // official source, 2 is authoritative, every other rank stays unrated. Each
  // search integration maps its own authority field onto these ranks.
  return { ...tierForRank(rank), ...(method ? { method } : {}), rank };
}

function tierForRank(rank: number): { tier: CredibilityTier } {
  if (rank === 1) return { tier: "official" };
  if (rank === 2) return { tier: "authoritative" };
  return { tier: "unrated" };
}

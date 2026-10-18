import type { CredibilityMethod, CredibilityTier } from "../index.js";
import type { SourceVerification } from "../../search/index.js";
import { credibilityForAuthLevel } from "./doubao.js";

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
  return certified(input.authInfoLevel ?? 4);
}

function certified(rank: number, method?: CredibilityMethod): ResolvedNewsCredibility {
  return { ...credibilityForAuthLevel(rank), ...(method ? { method } : {}), rank };
}

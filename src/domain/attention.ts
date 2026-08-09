import type { CandidateProject } from "./digest.js";

export type PresentationDepth = "link" | "summary" | "research";

/** Decide how much space a candidate deserves without coupling ranking to Markdown. */
export function presentationDepthForCandidate(candidate: CandidateProject): PresentationDepth {
  if (candidate.category === "paper") return "research";
  if (candidate.reasons.includes("multiple followed signals")) return "summary";
  if (candidate.reasons.includes("GitHub Home announcement")) return "summary";
  if (candidate.reasons.includes("important PR merged")) return "summary";
  if (candidate.reasons.some((reason) => reason.startsWith("matches interest: "))) {
    return "summary";
  }
  return "link";
}

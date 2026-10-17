import {
  presentationDecisionForCandidate,
  type CandidateProject,
  type PresentationDepth,
  type PresentationPolicy,
  type PresentationReasonCode,
} from "../subscription/subscription.js";

export type CandidateDecision = {
  key: string;
  label: string;
  url?: string;
  score: number;
  depth: PresentationDepth;
  presentationReasonCode?: PresentationReasonCode;
  presentationEvidence?: string;
  status: "selected" | "research-pending" | "filtered";
  reason: string;
};

export function decideCandidate(
  candidate: CandidateProject,
  selectedCandidates: CandidateProject[],
  reasonWhenFiltered: (candidate: CandidateProject) => string,
  identify: (candidate: CandidateProject) => string,
  presentationPolicy: PresentationPolicy = {},
): CandidateDecision {
  const selected = selectedCandidates.includes(candidate);
  const presentation = presentationDecisionForCandidate(candidate, presentationPolicy);
  const depth: PresentationDepth = presentation.depth;
  const presentationReasonCode: PresentationReasonCode = presentation.reasonCode;
  return {
    key: identify(candidate),
    label: candidate.label ?? candidate.repo,
    ...(candidate.url ? { url: candidate.url } : {}),
    score: candidate.score,
    depth,
    presentationReasonCode,
    ...(presentation.evidence ? { presentationEvidence: presentation.evidence } : {}),
    status: selected ? (depth === "research" ? "research-pending" : "selected") : "filtered",
    reason: selected
      ? depth === "research"
        ? "requires source verification before publication"
        : depth === "summary"
          ? `selected for expanded summary: ${presentation.reasonCode}${presentation.evidence ? ` (${presentation.evidence})` : ""}`
          : "selected for one-line delivery"
      : reasonWhenFiltered(candidate),
  };
}

import { candidateIdentity, type CandidateProject } from "./legacy-digest.js";
import {
  presentationDecisionForCandidate,
  type PresentationPolicy,
  type PresentationDepth,
  type PresentationReasonCode,
} from "./legacy-attention.js";
import type { RunCandidateDecision } from "../../../src/delivery/index.js";

// Storage types moved to the delivery module; re-exported so existing imports
// keep working during the transition.
export type {
  RunAudit,
  RunCandidateDecision,
  RunDelivery,
  RunEditorialSelectionDecision,
  RunProduct,
  RunSourceResult,
  RunPresentationDepth,
  RunPresentationReasonCode,
  StoredRunAudit,
} from "../../../src/delivery/index.js";

/**
 * Candidate decisions depend on the candidate shape and presentation depth;
 * they stay here until the editorial module owns them.
 */
export function candidateDecision(
  candidate: CandidateProject,
  selectedCandidates: CandidateProject[],
  reasonWhenFiltered: (candidate: CandidateProject) => string,
  presentationPolicy: PresentationPolicy = {},
): RunCandidateDecision {
  const selected = selectedCandidates.includes(candidate);
  const presentation = presentationDecisionForCandidate(candidate, presentationPolicy);
  const depth: PresentationDepth = presentation.depth;
  const presentationReasonCode: PresentationReasonCode = presentation.reasonCode;
  return {
    key: candidateIdentity(candidate),
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

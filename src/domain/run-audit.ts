import { candidateIdentity, type CandidateProject } from "./digest.js";
import {
  presentationDecisionForCandidate,
  type PresentationDepth,
  type PresentationReasonCode,
} from "./attention.js";

export type RunProduct = "subscriptions" | "frontier";
export type RunSourceResult = {
  id: string;
  kind: "github-home" | "github-events" | "rss" | "web-page";
  name: string;
  url?: string;
  status: "ok" | "failed" | "skipped";
  itemCount: number;
  error?: string;
};

export type RunCandidateDecision = {
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

export type RunAudit = {
  version: 1 | 2;
  runId: string;
  product: RunProduct;
  generatedAt: string;
  windowLabel?: string;
  sources: RunSourceResult[];
  counts: {
    fetched: number;
    inWindow: number;
    ranked: number;
    selected: number;
    researchPending: number;
  };
  candidates: RunCandidateDecision[];
};

export type RunDelivery = {
  status: "delivered" | "dry-run" | "failed";
  completedAt: string;
  channel: "stdout" | "webhook";
  stateStatus: "updated" | "skipped" | "failed";
  error?: string;
};

export type StoredRunAudit = RunAudit & { delivery: RunDelivery };

export function candidateDecision(
  candidate: CandidateProject,
  selectedCandidates: CandidateProject[],
  reasonWhenFiltered: (candidate: CandidateProject) => string,
): RunCandidateDecision {
  const selected = selectedCandidates.includes(candidate);
  const presentation = presentationDecisionForCandidate(candidate);
  const depth = presentation.depth;
  return {
    key: candidateIdentity(candidate),
    label: candidate.label ?? candidate.repo,
    ...(candidate.url ? { url: candidate.url } : {}),
    score: candidate.score,
    depth,
    presentationReasonCode: presentation.reasonCode,
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

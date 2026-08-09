import type { CandidateProject } from "./digest.js";
import { presentationDepthForCandidate, type PresentationDepth } from "./attention.js";

export type RunProduct = "subscriptions" | "frontier";
export type RunSourceResult = {
  id: string;
  kind: "github-home" | "github-events" | "rss";
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
  status: "selected" | "research-pending" | "filtered";
  reason: string;
};

export type RunAudit = {
  version: 1;
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
  const depth = presentationDepthForCandidate(candidate);
  return {
    key: candidate.repo,
    label: candidate.label ?? candidate.repo,
    ...(candidate.url ? { url: candidate.url } : {}),
    score: candidate.score,
    depth,
    status: selected ? (depth === "research" ? "research-pending" : "selected") : "filtered",
    reason: selected
      ? depth === "research"
        ? "requires source verification before publication"
        : depth === "summary"
          ? "selected for expanded summary"
          : "selected for one-line delivery"
      : reasonWhenFiltered(candidate),
  };
}

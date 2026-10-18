import {
  candidateEvidenceUrl,
  candidateIdentity,
  researchKeyForCandidate,
} from "../../../acquisition/index.js";
import {
  assembleSubscriptionEditorial,
  assembleSubscriptionEvidence,
  decideCandidate,
  selectedSubscriptionCandidates,
} from "../../../editorial/index.js";

import type {
  CandidateProject,
  PresentationDepth,
  PresentationReasonCode,
} from "../../../editorial/index.js";

/**
 * External JSON projections for the subscriptions product. The digest document
 * shape (including `sourceMode`) is consumed verbatim by skills, so it lives at
 * the product boundary rather than in editorial.
 */
export type DigestDocument = {
  generatedAt: string;
  displayDate?: string;
  username: string;
  sourceMode?: "mixed" | "rss";
  windowLabel?: string;
  candidates: CandidateProject[];
  audit?: DigestAudit;
};

export type DigestAudit = {
  version: 1 | 2;
  runId: string;
  product: "subscriptions" | "frontier";
  generatedAt: string;
  windowLabel?: string;
  sources: Array<{
    id: string;
    kind: string;
    name: string;
    url?: string;
    status: "ok" | "failed" | "skipped";
    itemCount: number;
    error?: string;
  }>;
  counts: {
    fetched: number;
    inWindow: number;
    ranked: number;
    selected: number;
    researchPending: number;
  };
  candidates: Array<{
    key: string;
    label: string;
    url?: string;
    score: number;
    depth: PresentationDepth;
    presentationReasonCode?: PresentationReasonCode;
    presentationEvidence?: string;
    status: "selected" | "research-pending" | "filtered";
    reason: string;
  }>;
  editorialSelection?: {
    selectedCount: number;
    decisions: Array<{ ref: string; selected: boolean; reason: string }>;
  };
};

const evidenceIdentity = {
  identify: candidateIdentity,
  fallbackUrl: (candidate: CandidateProject) => candidateEvidenceUrl(candidate),
};

export function subscriptionEvidenceId(candidate: CandidateProject): string {
  return candidateIdentity(candidate);
}

export function buildSubscriptionEvidence(document: DigestDocument) {
  return assembleSubscriptionEvidence(document, evidenceIdentity);
}

export function buildSubscriptionEditorial(
  document: DigestDocument,
  draft?: unknown,
  research?: unknown,
) {
  return assembleSubscriptionEditorial(document, evidenceIdentity, draft, research);
}

export function applySubscriptionSelection<T extends DigestDocument>(
  document: T,
  selection: Parameters<typeof selectedSubscriptionCandidates>[1],
): T {
  return {
    ...document,
    candidates: selectedSubscriptionCandidates(document.candidates, selection, candidateIdentity),
  };
}

export function candidateDecision(
  candidate: CandidateProject,
  selectedCandidates: CandidateProject[],
  reasonWhenFiltered: (candidate: CandidateProject) => string,
  presentationPolicy?: Parameters<typeof decideCandidate>[4],
) {
  return decideCandidate(
    candidate,
    selectedCandidates,
    reasonWhenFiltered,
    candidateIdentity,
    presentationPolicy,
  );
}

export { candidateIdentity, researchKeyForCandidate };

/** Record a research decision under the historical ledger key. */
export function markCandidateResearched(
  state: { researched: Record<string, { at: string; decision?: string; reason?: string }> },
  candidate: CandidateProject,
  record: { at: string; decision?: string; reason?: string },
): void {
  state.researched[researchKeyForCandidate(candidate)] = record;
}

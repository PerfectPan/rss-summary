import type { ActivityCardDto, RepositoryMetadata } from "../acquisition/index.js";
import { decideCandidate } from "./domain/decision/decision.js";
import {
  assembleSubscriptionEditorial,
  assembleSubscriptionEvidence,
  selectedSubscriptionCandidates,
} from "./domain/evidence/evidence.js";
import type {
  CandidateProject,
  PresentationDepth,
  PresentationReasonCode,
} from "./domain/subscription/subscription.js";

export type {
  ActivityCardDto as ActivityCard,
  ActivitySource,
  ActivityType,
  RepositoryMetadata,
} from "../acquisition/index.js";
export type { CandidateDecision } from "./domain/decision/decision.js";
export {
  buildDailyAiDigest,
  cleanDailyAiTitle,
  DailyAiDraftValidationError,
  dailyAiCategories,
  industryEvidence,
  validateEditorialDraft,
} from "./domain/daily-ai/daily-ai.js";
export type {
  DailyAiCategory,
  DailyAiDecision,
  DailyAiDigest,
  DailyAiEditorialIssue,
  DailyAiEditorialIssueReason,
  DailyAiEditorialItem,
  DailyAiEditorialValidation,
  DailyAiEvidence,
  DailyAiSourceTier,
} from "./domain/daily-ai/daily-ai.js";
export {
  excludeSubscriptionResearchFailures,
  mergeSubscriptionResearch,
  SubscriptionDraftValidationError,
  validateSubscriptionEditorialDraft,
  validateSubscriptionResearch,
  validateSubscriptionSelectionDraft,
} from "./domain/evidence/evidence.js";
export type {
  SubscriptionDraftValidationIssue,
  SubscriptionEditorial,
  SubscriptionEditorialItem,
  SubscriptionEvidence,
  SubscriptionEvidenceKind,
  SubscriptionResearch,
  SubscriptionSelection,
  SubscriptionSelectionDecision,
} from "./domain/evidence/evidence.js";
export { isSameEntityEvent, isSameHeadline, isSameTitleEvent } from "./domain/identity/identity.js";
export {
  applyEditorialSelectionToAudit,
  DEFAULT_LINK_SECTION_LIMIT,
  DEFAULT_SUMMARY_SECTION_LIMIT,
  presentationDecisionForCandidate,
  presentationDepthForCandidate,
  repositoryFactsForCandidate,
  scoreAcquired,
  selectCandidatePresentationSections,
  selectResearchCandidates,
} from "./domain/subscription/subscription.js";
export type {
  CandidatePresentationSections,
  CandidateProject,
  EditorialSelectionDecision,
  PresentationDecision,
  PresentationDepth,
  PresentationPolicy,
  PresentationReasonCode,
  ScoreOptions,
} from "./domain/subscription/subscription.js";

/**
 * Historical candidate keys still spell source prefixes. Hand-built
 * CandidateProject values carry no adapter routing, so the formulas stay on
 * this entry module. Concept directories only read the opaque strings.
 */
function activityIdentity(event: ActivityCardDto): string {
  if (event.type === "pull_request") {
    return `github-pull-request:${event.repo}:${event.prNumber ?? event.id}`;
  }
  if (
    event.source === "rss" ||
    event.source === "web" ||
    event.type === "article" ||
    event.type === "paper"
  ) {
    return `publication:${event.htmlUrl ?? event.id}`;
  }
  if (event.type === "release") return `github-release:${event.htmlUrl ?? event.id}`;
  return `github-repository:${event.repo}`;
}

/** Stable semantic identity used by audits and research state. */
export function candidateIdentity(candidate: CandidateProject): string {
  const event = candidate.events[0];
  if (event) return activityIdentity(event);
  if (candidate.source === "rss" || candidate.source === "web")
    return `publication:${candidate.url ?? candidate.repo}`;
  if (candidate.category === "release") return `github-release:${candidate.url ?? candidate.repo}`;
  return `github-repository:${candidate.repo}`;
}

/** Research ledger key. Prefixes stay here for the same reason as candidateIdentity. */
export function researchKeyForCandidate(candidate: CandidateProject): string {
  if (
    candidate.source === "rss" ||
    candidate.source === "web" ||
    candidate.category === "article" ||
    candidate.category === "paper"
  ) {
    return `${candidate.source === "web" ? "web" : "rss"}:${candidate.url ?? candidate.repo}`;
  }
  return `github:${candidate.repo}`;
}

export function markCandidateResearched(
  state: { researched: Record<string, { at: string; decision?: string; reason?: string }> },
  candidate: CandidateProject,
  record: { at: string; decision?: string; reason?: string },
): void {
  state.researched[researchKeyForCandidate(candidate)] = record;
}

export function subscriptionEvidenceId(candidate: CandidateProject): string {
  return candidateIdentity(candidate);
}

export type BuildCandidatesContext = {
  followees: Set<string>;
  interests: string[];
  repositories: Map<string, RepositoryMetadata>;
};

/** Pure digest document assembled by the application layer; rendered in presentation. */
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
  fallbackUrl: (candidate: CandidateProject) => `https://github.com/${candidate.repo}`,
};

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

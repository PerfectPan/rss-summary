import type {
  ActivityCardDto,
  RepositoryMetadata,
  SearchPage,
  SearchSettlement,
} from "../acquisition/index.js";
import {
  buildNewsAudit as buildNewsAuditDraft,
  summarizeNewsSources as summarizeNewsSourcesDraft,
  type NewsAuditRequest,
  type NewsBriefAuditDraft,
  type NewsNativeReceipt,
  type NewsQueryAuditDraft,
  type NewsQueryFailure,
  type NewsQueryPage,
  type NewsQuerySettlement,
  type NewsSourceStatus,
} from "./domain/news/audit.js";
import type { NewsHitDecision, NewsStoryDecision } from "./domain/news/news.js";
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

export type {
  NewsBriefEdition,
  NewsCredibility,
  NewsHitDecision,
  NewsHitRejectionReason,
  NewsQueryIntent,
  NewsScoreBreakdown,
  NewsSearchHit,
  NewsSourcePolicy,
  NewsStory,
  NewsStoryBuildResult,
  NewsStoryDecision,
  NewsStorySelectionReason,
  NewsStorySelectionResult,
  NewsTimeWindow,
  SelectedNewsStory,
} from "./domain/news/news.js";
export {
  buildNewsStories,
  buildNewsStoriesWithAudit,
  projectNewsHit,
  publicationFitsWindow,
  selectNewsStories,
  selectNewsStoriesWithAudit,
} from "./domain/news/news.js";
export type { NewsAuditRequest, NewsSourceStatus } from "./domain/news/audit.js";

type DomainNewsTopic = import("./domain/news/news.js").NewsTopic;
type DomainNewsTopicQuery = import("./domain/news/news.js").NewsTopicQuery;

/** JSON key kept for news-topics.json. The concept file does not name the provider. */
export type NewsTopicQuery = DomainNewsTopicQuery & {
  glm?: {
    query: string;
    domains: string[];
    sourceQueries?: Record<string, string>;
  };
};

export type NewsTopic = Omit<DomainNewsTopic, "queries"> & {
  queries: NewsTopicQuery[];
};

export type NewsQueryAudit = Omit<NewsQueryAuditDraft, "receipt"> & {
  grok?: NewsNativeReceipt;
};

export type NewsBriefAudit = Omit<NewsBriefAuditDraft, "queries"> & {
  queries: NewsQueryAudit[];
};

const modelSearchCaution =
  "X 资讯经 Grok 原生搜索和模型整理，未独立核验原文、作者或事实；搜索结果不代表完整时间线";

export function buildNewsAudit(
  requests: readonly NewsAuditRequest[],
  settled: readonly SearchSettlement[],
  decisions: NewsHitDecision[],
  storyDecisions: NewsStoryDecision[],
  deduplicatedStories: number,
  selectedStories: number,
): NewsBriefAudit {
  const draft = buildNewsAuditDraft(
    [...requests],
    settled.map(normalizeSettlement),
    decisions,
    storyDecisions,
    deduplicatedStories,
    selectedStories,
  );
  return { ...draft, queries: draft.queries.map(publishQueryAudit) };
}

export function summarizeNewsSources(
  requests: readonly NewsAuditRequest[],
  settled: readonly SearchSettlement[],
): { sourceStatus: NewsSourceStatus; warnings: string[] } {
  return summarizeNewsSourcesDraft(
    [...requests],
    settled.map(normalizeSettlement),
    modelSearchCaution,
  );
}

function publishQueryAudit(query: NewsQueryAuditDraft): NewsQueryAudit {
  const { receipt, ...rest } = query;
  if (query.status !== "ok") {
    return {
      queryId: query.queryId,
      query: query.query,
      intent: query.intent,
      topicId: query.topicId,
      topicLabel: query.topicLabel,
      status: query.status,
      fetched: query.fetched,
      accepted: query.accepted,
      rejected: query.rejected,
      ...(query.errorCode !== undefined ? { errorCode: query.errorCode } : {}),
      ...(receipt ? { grok: receipt } : {}),
      ...(query.error !== undefined ? { error: query.error } : {}),
    };
  }
  return {
    queryId: rest.queryId,
    query: rest.query,
    intent: rest.intent,
    topicId: rest.topicId,
    topicLabel: rest.topicLabel,
    status: "ok",
    ...(rest.logId ? { logId: rest.logId } : {}),
    ...(rest.provider ? { provider: rest.provider } : {}),
    ...(rest.searchUsage ? { searchUsage: rest.searchUsage } : {}),
    ...(rest.fallback ? { fallback: rest.fallback } : {}),
    ...(receipt ? { grok: receipt } : {}),
    reportedResultCount: rest.reportedResultCount,
    fetched: rest.fetched,
    accepted: rest.accepted,
    rejected: rest.rejected,
  };
}

function normalizeSettlement(settlement: SearchSettlement): NewsQuerySettlement {
  if (settlement._tag === "Fulfilled") {
    const page = settlement.value as SearchPage & { grok?: NewsNativeReceipt };
    const receipt = page.grok ? page.grok : undefined;
    const value: NewsQueryPage = {
      ...(page.provider ? { provider: page.provider } : {}),
      ...(page.searchUsage ? { searchUsage: page.searchUsage } : {}),
      ...(page.fallback ? { fallback: page.fallback } : {}),
      ...(page.logId ? { logId: page.logId } : {}),
      resultCount: page.resultCount,
      results: page.results,
      ...(receipt ? { receipt } : {}),
      ...(page.provider === "grok" ? { modelCompiled: true } : {}),
    };
    return { _tag: "Fulfilled", value };
  }
  const reason = settlement.reason;
  const tagged = isTaggedFailure(reason);
  const failure: NewsQueryFailure = {
    ...(tagged ? { code: reason.code } : {}),
    message: errorText(reason),
    ...(tagged && reason.grok ? { receipt: reason.grok } : {}),
  };
  return { _tag: "Rejected", reason: failure };
}

function isTaggedFailure(value: unknown): value is { code: string; grok?: NewsNativeReceipt } {
  if (typeof value !== "object" || value === null) return false;
  const failure = value as { _tag?: unknown; code?: unknown };
  return failure._tag === "SearchFailure" && typeof failure.code === "string";
}

function errorText(value: unknown): string {
  return Object.prototype.toString.call(value) === "[object Error]"
    ? (value as { message: string }).message
    : String(value);
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

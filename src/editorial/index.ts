export type {
  ActivityCardDto as ActivityCard,
  ActivitySource,
  ActivityType,
  RepositoryMetadata,
} from "../acquisition/index.js";
export type { CandidateDecision } from "./domain/decision/index.js";
export {
  buildDailyAiDigest,
  cleanDailyAiTitle,
  DailyAiDraftValidationError,
  dailyAiCategories,
  industryEvidence,
  validateEditorialDraft,
} from "./domain/daily-ai/index.js";
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
} from "./domain/daily-ai/index.js";
export {
  excludeSubscriptionResearchFailures,
  mergeSubscriptionResearch,
  SubscriptionDraftValidationError,
  validateSubscriptionEditorialDraft,
  validateSubscriptionResearch,
  validateSubscriptionSelectionDraft,
} from "./domain/evidence/index.js";
export type {
  SubscriptionDraftValidationIssue,
  SubscriptionEditorial,
  SubscriptionEditorialItem,
  SubscriptionEvidence,
  SubscriptionEvidenceKind,
  SubscriptionResearch,
  SubscriptionSelection,
  SubscriptionSelectionDecision,
} from "./domain/evidence/index.js";
export { isSameEntityEvent, isSameHeadline, isSameTitleEvent } from "./domain/identity/index.js";
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
} from "./domain/subscription/index.js";
export type {
  CandidatePresentationSections,
  CandidateProject,
  EditorialSelectionDecision,
  PresentationDecision,
  PresentationDepth,
  PresentationPolicy,
  PresentationReasonCode,
  ScoreOptions,
} from "./domain/subscription/index.js";
export {
  assembleSubscriptionEditorial,
  assembleSubscriptionEvidence,
  selectedSubscriptionCandidates,
} from "./domain/evidence/index.js";
export { decideCandidate } from "./domain/decision/index.js";
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
} from "./domain/news/index.js";
export {
  buildNewsStories,
  buildNewsStoriesWithAudit,
  projectNewsHit,
  publicationFitsWindow,
  selectNewsStories,
  selectNewsStoriesWithAudit,
} from "./domain/news/index.js";
export type { DomainNewsTopic, DomainNewsTopicQuery } from "./domain/news/index.js";
export type { NewsAuditRequest, NewsSourceStatus } from "./domain/news/index.js";
export { buildNewsAudit, summarizeNewsSources } from "./domain/news/index.js";
export type {
  NewsBriefAuditDraft,
  NewsNativeReceipt,
  NewsQueryAuditDraft,
  NewsQueryFailure,
  NewsQueryPage,
  NewsQuerySettlement,
} from "./domain/news/index.js";

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
export {
  assembleSubscriptionEditorial,
  assembleSubscriptionEvidence,
  selectedSubscriptionCandidates,
} from "./domain/evidence/evidence.js";
export { decideCandidate } from "./domain/decision/decision.js";
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
export type {
  NewsTopic as DomainNewsTopic,
  NewsTopicQuery as DomainNewsTopicQuery,
} from "./domain/news/news.js";
export type { NewsAuditRequest, NewsSourceStatus } from "./domain/news/audit.js";
export { buildNewsAudit, summarizeNewsSources } from "./domain/news/audit.js";
export type {
  NewsBriefAuditDraft,
  NewsNativeReceipt,
  NewsQueryAuditDraft,
  NewsQueryFailure,
  NewsQueryPage,
  NewsQuerySettlement,
} from "./domain/news/audit.js";

export type { CandidateDecision } from "./domain/decision/index.js";
export {
  buildDailyAiDigest,
  cleanDailyAiTitle,
  dailyAiCategories,
  industryEvidence,
  validateEditorialDraft
} from "./domain/daily-ai/index.js";
export type { DailyAiDigest, DailyAiEditorialItem, DailyAiEvidence } from "./domain/daily-ai/index.js";
export {
  excludeSubscriptionResearchFailures,
  validateSubscriptionEditorialDraft,
  validateSubscriptionResearch,
  validateSubscriptionSelectionDraft
} from "./domain/evidence/index.js";
export type { SubscriptionEvidence } from "./domain/evidence/index.js";
export {
  applyEditorialSelectionToAudit,
  presentationDecisionForCandidate,
  presentationDepthForCandidate,
  repositoryFactsForCandidate,
  scoreAcquired,
  selectCandidatePresentationSections,
  selectResearchCandidates
} from "./domain/subscription/index.js";
export type { CandidateProject } from "./domain/subscription/index.js";
export {
  assembleSubscriptionEditorial,
  assembleSubscriptionEvidence,
  selectedSubscriptionCandidates
} from "./domain/evidence/index.js";
export { decideCandidate } from "./domain/decision/index.js";
export type {
  NewsBriefEdition,
  NewsHitDecision,
  NewsQueryIntent,
  NewsSearchHit,
  NewsSourcePolicy,
  NewsStoryDecision,
  NewsTimeWindow,
  SelectedNewsStory
} from "./domain/news/index.js";
export {
  buildNewsStoriesWithAudit,
  projectNewsHit,
  publicationFitsWindow,
  selectNewsStoriesWithAudit
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
  NewsQuerySettlement
} from "./domain/news/index.js";

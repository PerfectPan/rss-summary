export { projectNewsHit } from "./factories/news-hit.js";
export {
  buildNewsStories,
  buildNewsStoriesWithAudit,
  publicationFitsWindow,
  selectNewsStories,
  selectNewsStoriesWithAudit,
} from "./policies/news-funnel.js";
export { buildNewsAudit, summarizeNewsSources } from "./services/news-audit.js";
export type {
  NewsAuditRequest,
  NewsBriefAuditDraft,
  NewsNativeReceipt,
  NewsQueryAuditDraft,
  NewsQueryFailure,
  NewsQueryPage,
  NewsQuerySettlement,
  NewsSourceStatus,
} from "./value-objects/news-audit.js";
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
} from "./value-objects/news.js";
export type {
  NewsTopic as DomainNewsTopic,
  NewsTopicQuery as DomainNewsTopicQuery,
} from "./value-objects/news.js";

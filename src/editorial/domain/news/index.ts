export { projectNewsHit } from "./factories/news-hit.js";
export {
  buildNewsStoriesWithAudit,
  publicationFitsWindow,
  selectNewsStoriesWithAudit
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
  NewsSourceStatus
} from "./value-objects/news-audit.js";
export type {
  NewsBriefEdition,
  NewsHitDecision,
  NewsQueryIntent,
  NewsSearchHit,
  NewsSourcePolicy,
  NewsStoryDecision,
  NewsTimeWindow,
  SelectedNewsStory
} from "./value-objects/news.js";
export type { NewsTopic as DomainNewsTopic, NewsTopicQuery as DomainNewsTopicQuery } from "./value-objects/news.js";

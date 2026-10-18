import type { GrokSearchAudit as GrokAudit } from "./domain/search/adapters/audit.js";
import type { SearchPage as SearchPageDocument } from "./domain/search/index.js";

export type {
  ActivityCardDto,
  ActivitySource,
  ActivityType,
  Acquired,
  PullRequestDetails,
  RepositoryMetadata,
} from "./domain/item/adapters/activity-card.js";
export { publicationAcquired } from "./domain/item/adapters/activity-card.js";
export {
  acquireActivityCard,
  activityGroupKey,
  applyScoringContext,
  projectActivity,
  refreshRouting,
  type ScoringContext,
} from "./domain/item/adapters/scoring-trace.js";
export {
  acquireGitHubEvent,
  decodeGitHubEvent,
  itemFromGitHubCard,
  normalizeEvent,
} from "./domain/item/adapters/github-event.js";
export {
  acquireHomeCard,
  acquireHomeCards,
  extractHomeFeedSnapshotsFromHtml,
  hasGitHubHomeFeedMarkup,
  normalizeHomeCardSnapshot,
  normalizeHomeCardSnapshots,
  type HomeFeedCardSnapshot,
  type HomeFeedLinkSnapshot,
} from "./domain/item/adapters/github-home.js";
export {
  acquireFollowing,
  acquirePullRequest,
  acquireRepository,
  followingLogins,
  pullRequestDetails,
  repositoryMetadata,
} from "./domain/item/adapters/github-repository.js";
export {
  resolveNewsCredibility,
  type ResolvedNewsCredibility,
} from "./domain/item/adapters/news-authority.js";
export { parseFeed, parseFeedXml } from "./domain/item/adapters/rss.js";
export {
  acquireWebPage,
  extractWebPageEntries,
  normalizeWebPageEntry,
  type WebPageEntry,
} from "./domain/item/adapters/web-page.js";
export type {
  CredibilityMethod,
  CredibilityTier,
  Item,
  ItemKind,
  SignalType,
  TimePrecision,
} from "./domain/item/index.js";
export {
  addFeedSubscription,
  formatFeedSubscriptions,
  parseFeedSubscriptions,
  parseIndustrySources,
  removeFeedSubscription,
} from "./domain/source/adapters/catalog.js";
export {
  isDailyAiPaperSource,
  listingPublicationType,
  rssPublicationType,
  type PublicationKind,
} from "./domain/source/adapters/publication.js";
export {
  isWebPageSource,
  type FeedSubscription,
  type FeedSubscriptionInput,
  type IndustrySource,
  type WebPageSubscription,
} from "./domain/source/index.js";
export {
  GitHubActivity,
  GitHubCatalog,
  RssFeed,
  SourceCatalogStore,
  WebPage,
  type PaginationOptions,
} from "./application/ports.js";
export {
  collectIndustrySources,
  collectRssFeeds,
  type SourceCollection,
  type SourceHealth,
} from "./application/use-cases/collect-sources.js";
export {
  addCatalogFeed,
  listCatalogFeeds,
  removeCatalogFeed,
} from "./application/use-cases/manage-source-catalog.js";
export {
  saveGithubHomeStorageState,
  type GithubHomeClientOptions,
  type GithubHomeFetchMode,
} from "./infra/adapters/github-home-browser.js";
export { decodeFeedsJson, feedsFileSchema } from "./infra/models/feeds.js";
export { decodeIndustryJson, industryFeedsFileSchema } from "./infra/models/industry-feeds.js";
export {
  AcquisitionLive,
  GitHubActivityLive,
  GitHubCatalogLive,
  RssFeedLive,
  SourceCatalogStoreLive,
  WebPageLive,
  type AcquisitionOptions,
} from "./infra/factories/live.js";
export {
  editionRotation,
  isSearchFailure,
  NewsSearchError,
  selectQueryIds,
  shareSearchBudget,
  type NewsSearchInput,
  type NewsSearchResult,
  type SearchFailure,
  type SearchInput,
  type SearchPage,
  type SearchResult,
  type SearchUsage,
} from "./domain/search/index.js";
export {
  errorAudit,
  pageAudit,
  type AuditedSearchPage,
  type GrokSearchAudit,
} from "./domain/search/adapters/audit.js";
export type NewsSearchPage = SearchPageDocument & { grok?: GrokAudit };
export { searchBudgetDefaults } from "./application/services/budget-defaults.js";
export {
  GrokProcess,
  SearchBudgetRepository,
  SearchProvider,
  type GrokProcessRequest,
} from "./application/ports.js";
export {
  retryDelayMs,
  retrySearchEffect,
  searchWithRetry,
  isTransientSearchError,
} from "./application/services/with-retry.js";
export {
  withBudget,
  type BudgetedSearch,
  type BudgetedSearchPage,
} from "./application/services/with-budget.js";
export { settleSearches, type SearchSettlement } from "./application/use-cases/search.js";
export { DoubaoSearchClient, DoubaoSearchLive } from "./infra/adapters/doubao-http.js";
export { DoubaoSearchError } from "./domain/item/adapters/doubao.js";
export {
  GrokProcessLive,
  GrokSearchClient,
  GrokSearchLive,
  GrokXClient,
} from "./infra/adapters/grok-cli.js";
export { GlmSearchClient, GlmSearchLive } from "./infra/adapters/glm-search.js";
export type { ResearchSearchResult } from "./domain/item/adapters/glm.js";
export {
  candidateEvidenceUrl,
  candidateIdentity,
  researchKeyForCandidate,
  type IdentitySubject,
} from "./domain/item/adapters/identity.js";
export { createBudgetedNewsSearch, type BudgetOptions } from "./infra/factories/budgeted-search.js";
export { collectXAccountPosts, type XAccountPosts } from "./infra/factories/x-account-posts.js";

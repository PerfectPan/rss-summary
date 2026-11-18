export type {
  ActivityCardDto,
  ActivitySource,
  ActivityType,
  Acquired,
  PullRequestDetails,
  RepositoryMetadata
} from "./domain/item/index.js";
export type {
  CredibilityMethod,
  CredibilityTier,
  Item,
  ItemKind,
  ItemRouting,
  SignalType
} from "./domain/item/index.js";
export { resolveNewsCredibility } from "./domain/item/policies/news-credibility.js";
export { addFeedSubscription } from "./domain/source/index.js";
/** @internal */
export { parseFeedSubscriptions, parseIndustrySources } from "./domain/source/index.js";
export { listingPublicationType } from "./domain/source/policies/publication.js";
export { type FeedSubscription, type IndustrySource, type WebPageSubscription } from "./domain/source/index.js";
export {
  GitHubActivity,
  GitHubCatalog,
  RssFeed,
  SourceCatalogStore,
  WebPage,
  type PaginationOptions
} from "./application/ports.js";
export { collectIndustrySources, collectRssFeeds } from "./application/use-cases/collect-sources.js";
export { addCatalogFeed, listCatalogFeeds, removeCatalogFeed } from "./application/use-cases/manage-source-catalog.js";
export { decodeFeedsJson } from "./infra/models/feeds.js";
export { decodeIndustryJson } from "./infra/models/industry-feeds.js";
export { SourceCatalogStoreLive } from "./infra/factories/live.js";
export { SearchBudgetRepositoryLive } from "./infra/repository/search-budget-file.js";
export {
  editionRotation,
  isSearchFailure,
  NewsSearchError,
  selectQueryIds,
  shareSearchBudget,
  type NativeSearchReceipt,
  type NewsSearchInput,
  type SearchInput,
  type SearchPage,
  type SearchResult,
  type SearchSourcePolicy
} from "./domain/search/index.js";
/** @internal */
export { type NewsSearchResult, type SearchUsage } from "./domain/search/index.js";
export { searchBudgetDefaults } from "./application/services/budget-defaults.js";
export { SearchBudgetRepository, SearchProvider } from "./application/ports.js";
export { retrySearchEffect } from "./application/services/with-retry.js";
export {
  shouldFallbackOnSourceOutage,
  withFallback,
  type FallbackSearchProvider
} from "./application/services/with-fallback.js";
export { mergeSearches, type SearchSource } from "./application/services/merge-searches.js";
export { settleSearches, type SearchSettlement } from "./application/use-cases/search.js";
export { createBudgetedNewsSearch } from "./infra/factories/budgeted-search.js";
export {
  collectXAccountPosts,
  type CollectXAccountOptions,
  type XAccountPosts
} from "./application/use-cases/collect-x-posts.js";

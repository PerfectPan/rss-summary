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
} from "./domain/item/item.js";
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
} from "./domain/source/subscription.js";
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
export { GitHubClient, type GitHubClientOptions } from "./infra/adapters/github-rest.js";
export {
  GitHubHomeClient,
  saveGithubHomeStorageState,
  type GithubHomeClientOptions,
  type GithubHomeFetchMode,
} from "./infra/adapters/github-home-browser.js";
export { RssClient, type RssClientOptions } from "./infra/adapters/rss-http.js";
export { WebPageClient, type WebPageClientOptions } from "./infra/adapters/web-page-http.js";
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
} from "./infra/live.js";

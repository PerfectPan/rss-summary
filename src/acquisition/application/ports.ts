import { Context, Effect } from "effect";

import type {
  ActivityCardDto,
  PullRequestDetails,
  RepositoryMetadata,
} from "../domain/item/adapters/activity-card.js";
import type { FeedSubscription, WebPageSubscription } from "../domain/source/subscription.js";

export type PaginationOptions = {
  perPage: number;
  pages: number;
};

export class RssFeed extends Context.Service<
  RssFeed,
  {
    readonly getFeedEvents: (feed: FeedSubscription) => Effect.Effect<ActivityCardDto[], Error>;
  }
>()("rss-summary/acquisition/RssFeed/v1") {}

export class WebPage extends Context.Service<
  WebPage,
  {
    readonly getEvents: (source: WebPageSubscription) => Effect.Effect<ActivityCardDto[], Error>;
  }
>()("rss-summary/acquisition/WebPage/v1") {}

/** Home and received-events are the two implementations behind this port. */
export class GitHubActivity extends Context.Service<
  GitHubActivity,
  {
    readonly getHomeEvents: () => Effect.Effect<ActivityCardDto[], Error>;
    readonly getReceivedEvents: (
      username: string,
      pagination: PaginationOptions,
    ) => Effect.Effect<ActivityCardDto[], Error>;
  }
>()("rss-summary/acquisition/GitHubActivity/v1") {}

export class GitHubCatalog extends Context.Service<
  GitHubCatalog,
  {
    readonly getRepository: (fullName: string) => Effect.Effect<RepositoryMetadata, Error>;
    readonly getPullRequest: (
      fullName: string,
      number: number,
    ) => Effect.Effect<PullRequestDetails, Error>;
    readonly getFollowing: (
      pagination?: PaginationOptions,
    ) => Effect.Effect<ReadonlySet<string>, Error>;
  }
>()("rss-summary/acquisition/GitHubCatalog/v1") {}

export class SourceCatalogStore extends Context.Service<
  SourceCatalogStore,
  {
    readonly loadFeeds: (path: string) => Effect.Effect<FeedSubscription[], Error>;
    readonly saveFeeds: (
      path: string,
      feeds: readonly FeedSubscription[],
    ) => Effect.Effect<void, Error>;
  }
>()("rss-summary/acquisition/SourceCatalogStore/v1") {}

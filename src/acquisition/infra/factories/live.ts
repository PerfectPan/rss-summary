import { Effect, Layer } from "effect";

import { acquireGitHubEvent } from "../../domain/item/adapters/github-event.js";
import { acquireActivityCard } from "../../domain/item/adapters/scoring-trace.js";
import type { GithubHomeClientOptions } from "../adapters/github-home-browser.js";
import { readHomeEvents } from "../adapters/github-home-browser.js";
import { GitHubCatalogLive, readReceivedEvents } from "../adapters/github-rest.js";
import { RssFeedLive } from "../adapters/rss-http.js";
import { WebPageLive } from "../adapters/web-page-http.js";
import { NodeFileSystemLive } from "../adapters/node-file-system.js";
import { SourceCatalogFileLive } from "../repository/source-catalog-file.js";
import {
  GitHubActivity,
  GitHubCatalog,
  RssFeed,
  SearchBudgetRepository,
  SourceCatalogStore,
  WebPage,
} from "../../application/ports.js";
import { SearchBudgetRepositoryLive } from "../repository/search-budget-file.js";

export type AcquisitionOptions = {
  token?: string;
  fetch?: typeof fetch;
  githubHome?: GithubHomeClientOptions;
};

export { GitHubCatalogLive, RssFeedLive, WebPageLive };

export const GitHubActivityLive = (options: {
  token?: string;
  fetch?: typeof fetch;
  githubHome?: GithubHomeClientOptions;
}): Layer.Layer<GitHubActivity> =>
  Layer.succeed(GitHubActivity, {
    getHomeEvents: () => {
      if (!options.githubHome) {
        return Effect.fail(
          new Error(
            "GitHub Home storage state not found: . Run 'rss-summary github-home login' first.",
          ),
        );
      }
      return Effect.map(readHomeEvents(options.githubHome), (events) =>
        events.map((card) => acquireActivityCard(card)),
      );
    },
    getReceivedEvents: (username, pagination) =>
      Effect.map(readReceivedEvents(username, pagination, options), (events) =>
        events.map((event) => acquireActivityCard(acquireGitHubEvent(event).card)),
      ),
  });

export const SourceCatalogStoreLive: Layer.Layer<SourceCatalogStore> = SourceCatalogFileLive.pipe(
  Layer.provide(NodeFileSystemLive),
);

export function AcquisitionLive(
  options: AcquisitionOptions = {},
): Layer.Layer<
  RssFeed | WebPage | GitHubActivity | GitHubCatalog | SourceCatalogStore | SearchBudgetRepository
> {
  return Layer.mergeAll(
    RssFeedLive({ fetch: options.fetch }),
    WebPageLive({ fetch: options.fetch }),
    GitHubActivityLive(options),
    GitHubCatalogLive({ token: options.token, fetch: options.fetch }),
    SourceCatalogStoreLive,
    SearchBudgetRepositoryLive,
  );
}

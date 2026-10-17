import { Effect, Layer } from "effect";

import { normalizeEvent } from "../domain/item/adapters/github-event.js";
import type { GithubHomeClientOptions } from "./adapters/github-home-browser.js";
import { GitHubHomeClient } from "./adapters/github-home-browser.js";
import { GitHubClient, type PaginationOptions } from "./adapters/github-rest.js";
import { RssClient, type RssClientOptions } from "./adapters/rss-http.js";
import { WebPageClient, type WebPageClientOptions } from "./adapters/web-page-http.js";
import { NodeFileSystemLive } from "./node-file-system.js";
import { SourceCatalogFileLive } from "./repository/source-catalog-file.js";
import {
  GitHubActivity,
  GitHubCatalog,
  RssFeed,
  SourceCatalogStore,
  WebPage,
} from "../application/ports.js";

export type AcquisitionOptions = {
  token?: string;
  fetch?: typeof fetch;
  rss?: RssClientOptions;
  web?: WebPageClientOptions;
  githubHome?: GithubHomeClientOptions;
};

export const RssFeedLive = (options: RssClientOptions = {}): Layer.Layer<RssFeed> => {
  const client = new RssClient(options);
  return Layer.succeed(RssFeed, {
    getFeedEvents: (feed) =>
      Effect.tryPromise({ try: () => client.getFeedEvents(feed), catch: asError }),
  });
};

export const WebPageLive = (options: WebPageClientOptions = {}): Layer.Layer<WebPage> => {
  const client = new WebPageClient(options);
  return Layer.succeed(WebPage, {
    getEvents: (source) =>
      Effect.tryPromise({ try: () => client.getEvents(source), catch: asError }),
  });
};

export const GitHubActivityLive = (options: {
  token?: string;
  fetch?: typeof fetch;
  githubHome?: GithubHomeClientOptions;
}): Layer.Layer<GitHubActivity> => {
  const github = new GitHubClient({ token: options.token, fetch: options.fetch });
  return Layer.succeed(GitHubActivity, {
    getHomeEvents: () =>
      Effect.tryPromise({
        try: () => {
          if (!options.githubHome) {
            return Promise.reject(
              new Error(
                "GitHub Home storage state not found: . Run 'rss-summary github-home login' first.",
              ),
            );
          }
          return new GitHubHomeClient(options.githubHome).getHomeEvents();
        },
        catch: asError,
      }),
    getReceivedEvents: (username: string, pagination: PaginationOptions) =>
      Effect.tryPromise({
        try: async () => (await github.getReceivedEvents(username, pagination)).map(normalizeEvent),
        catch: asError,
      }),
  });
};

export const GitHubCatalogLive = (options: {
  token?: string;
  fetch?: typeof fetch;
}): Layer.Layer<GitHubCatalog> => {
  const github = new GitHubClient({ token: options.token, fetch: options.fetch });
  return Layer.succeed(GitHubCatalog, {
    getRepository: (fullName) =>
      Effect.tryPromise({ try: () => github.getRepository(fullName), catch: asError }),
    getPullRequest: (fullName, number) =>
      Effect.tryPromise({ try: () => github.getPullRequest(fullName, number), catch: asError }),
    getFollowing: (pagination) =>
      Effect.tryPromise({ try: () => github.getFollowing(pagination), catch: asError }),
  });
};

export const SourceCatalogStoreLive: Layer.Layer<SourceCatalogStore> = SourceCatalogFileLive.pipe(
  Layer.provide(NodeFileSystemLive),
);

export function AcquisitionLive(
  options: AcquisitionOptions = {},
): Layer.Layer<RssFeed | WebPage | GitHubActivity | GitHubCatalog | SourceCatalogStore> {
  const fetch = options.fetch;
  return Layer.mergeAll(
    RssFeedLive({ fetch, ...options.rss }),
    WebPageLive({ fetch, ...options.web }),
    GitHubActivityLive({ token: options.token, fetch, githubHome: options.githubHome }),
    GitHubCatalogLive({ token: options.token, fetch }),
    SourceCatalogStoreLive,
  );
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

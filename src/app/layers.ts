import { layer as NodeFileSystemLayer } from "@effect/platform-node/NodeFileSystem";
import { Effect, Layer } from "effect";

import {
  GitHubActivity,
  GitHubCatalog,
  RssFeed,
  SearchBudgetRepository,
  SourceCatalogStore,
  SearchBudgetRepositoryLive,
  SourceCatalogStoreLive,
  WebPage,
} from "../acquisition/index.js";
import {
  DeliveryLive,
  DiagnosticsStore,
  FeedStateStore,
  Notifier,
  RunArchive,
} from "../delivery/index.js";
import {
  BrowserReader,
  GlmReader,
  HttpReader,
  type GlmPage,
  VideoReader,
} from "../reading/index.js";
import { ArticleResearchClient, extractArticle } from "../integrations/article-http/index.js";
import { browserArticleResearch, type BrowserPageFetcher } from "../integrations/browser/index.js";
import { readGlmPage } from "../integrations/glm/index.js";
import { GitHubActivityLive, GitHubCatalogLive } from "../integrations/github/index.js";
import { RssFeedLive } from "../integrations/rss/index.js";
import { WebPageLive } from "../integrations/web-page/index.js";
import type { GithubHomeClientOptions } from "../integrations/github/index.js";
import {
  transcriptEvidence,
  VideoResearchClient,
  videoVisualEvidence,
  type VideoTranscriptFormatter,
  type VideoVisualFormatter,
} from "../integrations/video/index.js";
import type { ReadRequest, ReadResult } from "../reading/index.js";
import type { DeliveryOptions } from "../delivery/index.js";
import { loadEnvConfig, type AppConfig } from "./config/env.js";

export type ReadingLiveOptions = {
  apiKey?: string;
  browserChannel?: string;
  browserResearch?: (request: ReadRequest) => Effect.Effect<ReadResult>;
  browserTimeoutMs?: number;
  fetch?: typeof fetch;
  fetchPage?: BrowserPageFetcher;
  formatTranscript?: VideoTranscriptFormatter;
  formatVisuals?: VideoVisualFormatter;
  glmRead?: (url: string) => Promise<GlmPage>;
  glmTimeoutMs?: number;
  headless?: boolean;
  httpResearch?: ArticleResearchClient["research"];
  maxBytes?: number;
  maxChars?: number;
  now?: () => Date;
  timeoutMs?: number;
  videoEnv?: NodeJS.ProcessEnv;
  videoResearch?: VideoResearchClient["research"];
};

/**
 * Assemble the reading ports from their integrations: the HTTP/browser/video
 * readers and the GLM fallback. Substitutes let hosts and tests replace one
 * leg of the chain without touching the others.
 */
export function ReadingLive(
  options: ReadingLiveOptions = {},
): Layer.Layer<HttpReader | BrowserReader | VideoReader | GlmReader, never, never> {
  const httpClient = new ArticleResearchClient({
    extract: extractArticle,
    fetch: options.fetch,
    maxBytes: options.maxBytes,
    maxChars: options.maxChars,
    now: options.now,
    timeoutMs: options.timeoutMs,
  });
  const browserResearch = browserArticleResearch({
    browserChannel: options.browserChannel,
    extract: extractArticle,
    fetchPage: options.fetchPage,
    headless: options.headless,
    maxChars: options.maxChars,
    timeoutMs: options.browserTimeoutMs,
  });
  const videoClient = new VideoResearchClient({
    env: options.videoEnv,
    fetch: options.fetch,
    formatTranscript: options.formatTranscript ?? transcriptEvidence,
    formatVisuals: options.formatVisuals ?? videoVisualEvidence,
  });
  const http = Layer.succeed(HttpReader, {
    research: (request) =>
      Effect.promise(() => (options.httpResearch ?? httpClient.research.bind(httpClient))(request)),
  });
  const browser = Layer.succeed(BrowserReader, {
    research: options.browserResearch ?? browserResearch,
  });
  const video = Layer.succeed(VideoReader, {
    research: (request) =>
      Effect.promise(() =>
        (options.videoResearch ?? videoClient.research.bind(videoClient))(request),
      ),
  });
  const glm = Layer.succeed(GlmReader, {
    read: (url) =>
      Effect.tryPromise({
        try: () =>
          (
            options.glmRead ??
            ((target: string) =>
              readGlmPage(target, {
                apiKey: options.apiKey ?? "",
                fetch: options.fetch,
                timeoutMs: options.glmTimeoutMs,
              }))
          )(url),
        catch: (cause) => cause,
      }),
  });
  return Layer.mergeAll(http, browser, video, glm);
}

export type AcquisitionOptions = {
  token?: string;
  fetch?: typeof fetch;
  githubHome?: GithubHomeClientOptions;
};

/**
 * Assemble the acquisition ports from their integrations (feed, listing pages,
 * GitHub activity and catalog) plus the module's own state-backed stores.
 */
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

/** Every port the app consumes, provided by AppLive. */
export type AppServices =
  | RssFeed
  | WebPage
  | GitHubActivity
  | GitHubCatalog
  | SourceCatalogStore
  | SearchBudgetRepository
  | FeedStateStore
  | Notifier
  | RunArchive
  | DiagnosticsStore
  | HttpReader
  | BrowserReader
  | VideoReader
  | GlmReader;

export type AppLiveOptions = {
  acquisition?: AcquisitionOptions;
  delivery?: DeliveryOptions;
  reading?: ReadingLiveOptions;
};

/**
 * Assemble every module's live layer plus the Node platform layer. The module
 * layers receive their environment-derived options; NodeFileSystem comes from
 * @effect/platform-node and stays merged into the output.
 */
export function AppLive(options: AppLiveOptions = {}): Layer.Layer<AppServices> {
  return Layer.provideMerge(
    Layer.mergeAll(
      AcquisitionLive(options.acquisition),
      ReadingLive(options.reading),
      DeliveryLive(options.delivery),
    ),
    NodeFileSystemLayer,
  );
}

/** Layer options derived from a resolved configuration. */
export function appLiveOptions(config: AppConfig): AppLiveOptions {
  return {
    acquisition: {
      ...(config.token === undefined ? {} : { token: config.token }),
      githubHome: {
        storageState: config.githubHomeStorageState,
        fetchMode: config.githubHomeFetch,
        ...(config.githubHomeBrowserChannel === undefined
          ? {}
          : { browserChannel: config.githubHomeBrowserChannel }),
      },
    },
    delivery: {
      ...(config.webhookUrl === undefined ? {} : { webhookUrl: config.webhookUrl }),
      env: config.raw,
    },
    reading: {
      apiKey: config.glmCodingApiKey,
      browserChannel: config.articleResearch.browserChannel,
      browserTimeoutMs: config.articleResearch.browserTimeoutMs,
      headless: config.articleResearch.browserHeadless,
    },
  };
}

function rawOptions(env: NodeJS.ProcessEnv): AppLiveOptions {
  return {
    acquisition: {
      token: env.GH_FEED_TOKEN ?? env.GITHUB_TOKEN,
      githubHome: {
        storageState: env.GITHUB_HOME_STORAGE_STATE ?? ".state/github-home-storage.json",
        fetchMode: env.GITHUB_HOME_FETCH === "browser" ? "browser" : "conduit",
        ...(env.GITHUB_HOME_BROWSER_CHANNEL === undefined
          ? {}
          : { browserChannel: env.GITHUB_HOME_BROWSER_CHANNEL }),
      },
    },
    delivery: { env },
    reading: {
      apiKey: env.GLM_CODING_API_KEY ?? "",
      browserChannel: env.RSS_ARTICLE_BROWSER_CHANNEL?.trim() || "chrome",
      headless: env.RSS_ARTICLE_BROWSER_HEADLESS !== "false",
    },
  };
}

/**
 * AppLive from a configuration effect, so CLI boundary failures (invalid
 * environment, missing files) surface through the command's exit path.
 */
export function appLayerFromConfig(
  config: Effect.Effect<AppConfig, Error>,
): Layer.Layer<AppServices, Error> {
  return Layer.unwrap(Effect.map(config, (resolved) => AppLive(appLiveOptions(resolved))));
}

/**
 * AppLive reading the environment when the layer is built. Service-free
 * effects must not fail on invalid configuration — validation errors surface
 * from the flows that parse the same environment strictly — so option
 * extraction falls back to unvalidated values.
 */
export const AppLiveFromEnv: Layer.Layer<AppServices> = Layer.unwrap(
  Effect.match(loadEnvConfig(), {
    onFailure: () => AppLive(rawOptions(process.env)),
    onSuccess: (config) => AppLive(appLiveOptions(config)),
  }),
);

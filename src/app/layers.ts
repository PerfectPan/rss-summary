import { layer as NodeFileSystemLayer } from "@effect/platform-node/NodeFileSystem";
import { Effect, Layer } from "effect";

import {
  AcquisitionLive,
  GitHubActivity,
  GitHubCatalog,
  RssFeed,
  SearchBudgetRepository,
  SourceCatalogStore,
  WebPage,
  type AcquisitionOptions,
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
  ReadingLive,
  VideoReader,
  type ReadingLiveOptions,
} from "../reading/index.js";
import type { DeliveryOptions } from "../delivery/index.js";
import { loadEnvConfig, type AppConfig } from "./config/env.js";

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

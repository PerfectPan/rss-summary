import { Effect, Layer } from "effect";

import {
  BrowserReader,
  GlmReader,
  HttpReader,
  VideoReader,
  type GlmPage,
} from "./application/ports.js";
import { extractArticle } from "./domain/document/adapters/html-article.js";
import type { ReadRequest, ReadResult } from "./domain/document/document.js";
import {
  transcriptEvidence,
  videoVisualEvidence,
} from "./domain/document/adapters/video-evidence.js";
import {
  browserArticleResearch,
  type BrowserPageFetcher,
} from "./infra/adapters/browser-reader.js";
import { readGlmPage } from "./infra/adapters/glm-reader.js";
import { ArticleResearchClient } from "./infra/adapters/http-reader.js";
import {
  VideoResearchClient,
  type VideoTranscriptFormatter,
  type VideoVisualFormatter,
} from "./infra/adapters/video-reader.js";

export {
  documentMethods,
  type Document,
  type DocumentMaterials,
  type DocumentMethod,
  type ReadFailure,
  type ReadRequest,
  type ReadResult,
  type ReadSuccess,
  type VideoFrame,
  type VideoVisuals,
} from "./domain/document/document.js";
export {
  isPrivateIpv4,
  isVideoResearchUrl,
  validateArticleResearchUrl,
  validateResearchUrl,
} from "./domain/document/url-policy.js";
export { extractArticle } from "./domain/document/adapters/html-article.js";
export {
  transcriptEvidence,
  videoVisualEvidence,
} from "./domain/document/adapters/video-evidence.js";
export {
  BrowserReader,
  GlmReader,
  HttpReader,
  VideoReader,
  type GlmPage,
} from "./application/ports.js";
export {
  readOriginal,
  type ReadMethod,
  type ReadMode,
  type ReadOriginalRequest,
  type ReadOriginalResult,
} from "./application/use-cases/read-original.js";
export { readGlmPage, type GlmReadOptions } from "./infra/adapters/glm-reader.js";
export {
  ArticleResearchClient,
  type ArticleExtract,
  type ArticleResearchClientOptions,
  type ArticleResearchRequest,
  type ArticleResearchResult,
} from "./infra/adapters/http-reader.js";
export {
  browserArticleResearch,
  type BrowserPageFetcher,
  type BrowserReaderOptions,
} from "./infra/adapters/browser-reader.js";
export { captureVideoFrames } from "./infra/adapters/video-frames.js";
export {
  VideoResearchClient,
  type VideoTranscriptFormatter,
  type VideoVisualFormatter,
} from "./infra/adapters/video-reader.js";

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

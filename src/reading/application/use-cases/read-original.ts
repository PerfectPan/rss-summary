import { Clock, Effect } from "effect";

import type { DocumentMethod, ReadResult } from "../../domain/document/document.js";
import { isVideoResearchUrl, validateResearchUrl } from "../../domain/document/url-policy.js";
import { BrowserReader, GlmReader, HttpReader, VideoReader } from "../ports.js";

export type ReadMode = "auto" | "browser" | "http";

/** Reader name used only after the browser and HTTP readers both fail. */
export type ReadMethod = DocumentMethod | "glm";

export type ReadOriginalRequest = {
  glmFallback: boolean;
  mode: ReadMode;
  ref: string;
  url: string;
};

export type ReadOriginalResult =
  | (Omit<Extract<ReadResult, { status: "ok" }>, "method"> & { method?: ReadMethod })
  | (Omit<Extract<ReadResult, { status: "failed" }>, "method"> & { method?: ReadMethod });

export function readOriginal(
  request: ReadOriginalRequest,
): Effect.Effect<ReadOriginalResult, never, HttpReader | BrowserReader | VideoReader | GlmReader> {
  return Effect.gen(function* () {
    try {
      validateResearchUrl(request.url);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        ref: request.ref,
        retrievedAt: new Date(yield* Clock.currentTimeMillis).toISOString(),
        status: "failed" as const,
        url: request.url,
      };
    }
    const target = { ref: request.ref, url: request.url };
    if (isVideoResearchUrl(request.url)) {
      const video = yield* VideoReader;
      return yield* video.research(target);
    }
    if (request.mode === "http") {
      const http = yield* HttpReader;
      return yield* http.research(target);
    }
    if (request.mode === "browser") {
      const browser = yield* BrowserReader;
      return yield* browser.research(target);
    }

    const browser = yield* BrowserReader;
    const browserResult = yield* browser.research(target);
    if (browserResult.status === "ok") return browserResult;
    const http = yield* HttpReader;
    const httpResult = yield* http.research(target);
    if (httpResult.status === "ok") return httpResult;
    if (!request.glmFallback) {
      return {
        ...httpResult,
        error: `browser: ${browserResult.error}; http: ${httpResult.error}`,
      };
    }

    const glm = yield* GlmReader;
    return yield* Effect.catch(
      Effect.gen(function* () {
        const page = yield* glm.read(request.url);
        if (page.content.trim().length < 80) {
          return yield* Effect.fail(new Error("Reader body too short"));
        }
        return {
          content: page.content,
          fetchedUrl: page.url,
          method: "glm" as const,
          ref: request.ref,
          retrievedAt: new Date(yield* Clock.currentTimeMillis).toISOString(),
          status: "ok" as const,
          title: page.title,
          url: request.url,
        };
      }),
      () =>
        Effect.succeed({
          ...httpResult,
          error: "Browser, HTTP and GLM Reader unavailable.",
        }),
    );
  });
}

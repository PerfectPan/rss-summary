import { Clock, Effect, Layer } from "effect";

import { describe, expect, it, vi } from "vite-plus/test";

import { BrowserReader, GlmReader, HttpReader, VideoReader } from "../ports.js";
import { readOriginal, type ReadOriginalRequest } from "./read-original.js";
import type { ReadRequest, ReadResult } from "../../domain/document/document.js";
import type { GlmPage } from "../ports.js";

const article = "https://example.com/article";
const video = "https://www.youtube.com/watch?v=example";
const longBody = "Source content. ".repeat(10);

function ok(request: ReadRequest, title: string): ReadResult {
  return {
    content: longBody,
    fetchedUrl: request.url,
    ref: request.ref,
    retrievedAt: "2026-08-17T01:00:00.000Z",
    status: "ok",
    title,
    url: request.url,
  };
}

function failed(request: ReadRequest, error: string): ReadResult {
  return {
    error,
    ref: request.ref,
    retrievedAt: "2026-08-17T01:00:00.000Z",
    status: "failed",
    url: request.url,
  };
}

function harness(
  handlers: {
    browser?: (request: ReadRequest) => Promise<ReadResult>;
    glm?: (url: string) => Promise<GlmPage>;
    http?: (request: ReadRequest) => Promise<ReadResult>;
    video?: (request: ReadRequest) => Promise<ReadResult>;
  } = {},
) {
  const calls: string[] = [];
  const http = vi.fn(async (request: ReadRequest) => {
    calls.push("http");
    return handlers.http ? handlers.http(request) : failed(request, "http down");
  });
  const browser = vi.fn(async (request: ReadRequest) => {
    calls.push("browser");
    return handlers.browser ? handlers.browser(request) : failed(request, "browser down");
  });
  const videoReader = vi.fn(async (request: ReadRequest) => {
    calls.push("video");
    return handlers.video ? handlers.video(request) : ok(request, "Video");
  });
  const glm = vi.fn(async (url: string) => {
    calls.push("glm");
    return handlers.glm
      ? handlers.glm(url)
      : { title: "Article", url, content: longBody, truncated: false };
  });
  const live = Layer.mergeAll(
    Layer.succeed(HttpReader, { research: (request) => Effect.promise(() => http(request)) }),
    Layer.succeed(BrowserReader, {
      research: (request) => Effect.promise(() => browser(request)),
    }),
    Layer.succeed(VideoReader, {
      research: (request) => Effect.promise(() => videoReader(request)),
    }),
    Layer.succeed(GlmReader, {
      read: (url) => Effect.tryPromise({ try: () => glm(url), catch: (cause) => cause }),
    }),
  );
  return { browser, calls, glm, http, live, video: videoReader };
}

function frozenClock(millis: number): Clock.Clock {
  return {
    currentTimeMillis: Effect.succeed(millis),
    currentTimeMillisUnsafe: () => millis,
    currentTimeNanos: Effect.succeed(BigInt(millis) * 1_000_000n),
    currentTimeNanosUnsafe: () => BigInt(millis) * 1_000_000n,
    monotonicTimeNanos: Effect.succeed(0n),
    monotonicTimeNanosUnsafe: () => 0n,
    sleep: () => Effect.void,
  };
}

function run(
  request: ReadOriginalRequest,
  live: Layer.Layer<HttpReader | BrowserReader | VideoReader | GlmReader>,
  millis = 1_756_000_000_000,
) {
  return Effect.runPromise(
    readOriginal(request).pipe(
      Effect.provide(live),
      Effect.provideService(Clock.Clock, frozenClock(millis)),
    ),
  );
}

describe("readOriginal", () => {
  it("returns the validation error and does not call a reader", async () => {
    const readers = harness();
    const result = await run(
      { glmFallback: true, mode: "auto", ref: "article:1", url: "http://127.0.0.1/admin" },
      readers.live,
    );
    expect(result).toEqual({
      error: "article URL points to a private or local host",
      ref: "article:1",
      retrievedAt: new Date(1_756_000_000_000).toISOString(),
      status: "failed",
      url: "http://127.0.0.1/admin",
    });
    expect(readers.calls).toEqual([]);
  });

  it.each(["auto", "browser", "http"] as const)(
    "routes a video URL to VideoReader in %s mode",
    async (mode) => {
      const readers = harness({
        video: async (request) => ({ ...ok(request, "Video"), method: "captions" }),
      });
      const result = await run(
        { glmFallback: true, mode, ref: "video:1", url: video },
        readers.live,
      );
      expect(result).toMatchObject({ method: "captions", status: "ok" });
      expect(readers.calls).toEqual(["video"]);
    },
  );

  it("uses only HTTP when mode is http", async () => {
    const readers = harness({
      http: async (request) => ({ ...ok(request, "HTTP"), method: "http" }),
    });
    const result = await run(
      { glmFallback: true, mode: "http", ref: "article:1", url: article },
      readers.live,
    );
    expect(result).toMatchObject({ method: "http", title: "HTTP" });
    expect(readers.calls).toEqual(["http"]);
  });

  it("uses only the browser when mode is browser", async () => {
    const readers = harness({
      browser: async (request) => failed(request, "browser timeout"),
    });
    const result = await run(
      { glmFallback: true, mode: "browser", ref: "article:1", url: article },
      readers.live,
    );
    expect(result).toMatchObject({ error: "browser timeout", status: "failed" });
    expect(readers.calls).toEqual(["browser"]);
  });

  it("stops after a successful browser read in auto mode", async () => {
    const readers = harness({
      browser: async (request) => ({ ...ok(request, "Rendered"), method: "browser" }),
    });
    const result = await run(
      { glmFallback: false, mode: "auto", ref: "article:1", url: article },
      readers.live,
    );
    expect(result).toMatchObject({ title: "Rendered" });
    expect(readers.calls).toEqual(["browser"]);
  });

  it("falls back to HTTP after the browser fails", async () => {
    const readers = harness({
      browser: async (request) => failed(request, "browser timeout"),
      http: async (request) => ({ ...ok(request, "HTTP"), method: "http" }),
    });
    const result = await run(
      { glmFallback: false, mode: "auto", ref: "article:1", url: article },
      readers.live,
    );
    expect(result).toMatchObject({ title: "HTTP" });
    expect(readers.calls).toEqual(["browser", "http"]);
  });

  it("joins both reader errors when GLM fallback is off", async () => {
    const readers = harness({
      browser: async (request) => failed(request, "browser timeout"),
      http: async (request) => failed(request, "http status"),
    });
    const result = await run(
      { glmFallback: false, mode: "auto", ref: "article:1", url: article },
      readers.live,
    );
    expect(result).toMatchObject({
      error: "browser: browser timeout; http: http status",
      status: "failed",
    });
    expect(readers.calls).toEqual(["browser", "http"]);
  });

  it("reads with GLM after both readers fail when fallback is on", async () => {
    const readers = harness();
    const result = await run(
      { glmFallback: true, mode: "auto", ref: "article:1", url: article },
      readers.live,
      1_756_000_000_000,
    );
    expect(result).toMatchObject({
      content: longBody,
      fetchedUrl: article,
      method: "glm",
      retrievedAt: new Date(1_756_000_000_000).toISOString(),
      status: "ok",
      title: "Article",
    });
    expect(readers.calls).toEqual(["browser", "http", "glm"]);
  });

  it("treats a short GLM body as an unavailable reader", async () => {
    const readers = harness({
      glm: async (url) => ({ title: "Article", url, content: "too short", truncated: false }),
    });
    const result = await run(
      { glmFallback: true, mode: "auto", ref: "article:1", url: article },
      readers.live,
    );
    expect(result).toMatchObject({
      error: "Browser, HTTP and GLM Reader unavailable.",
      status: "failed",
    });
    expect(readers.calls).toEqual(["browser", "http", "glm"]);
  });

  it("rejects a GLM body of 79 characters after trim", async () => {
    const content = ` ${"a".repeat(79)} `;
    const readers = harness({
      glm: async (url) => ({ title: "Article", url, content, truncated: false }),
    });
    const result = await run(
      { glmFallback: true, mode: "auto", ref: "article:1", url: article },
      readers.live,
    );
    expect(content.trim()).toHaveLength(79);
    expect(result).toMatchObject({
      error: "Browser, HTTP and GLM Reader unavailable.",
      status: "failed",
    });
    expect(readers.calls).toEqual(["browser", "http", "glm"]);
  });

  it("accepts a GLM body of 80 characters after trim", async () => {
    const content = ` ${"b".repeat(80)} `;
    const readers = harness({
      glm: async (url) => ({ title: "Article", url, content, truncated: false }),
    });
    const result = await run(
      { glmFallback: true, mode: "auto", ref: "article:1", url: article },
      readers.live,
      1_756_000_000_000,
    );
    expect(content.trim()).toHaveLength(80);
    expect(result).toMatchObject({
      content,
      fetchedUrl: article,
      method: "glm",
      retrievedAt: new Date(1_756_000_000_000).toISOString(),
      status: "ok",
      title: "Article",
    });
    expect(readers.calls).toEqual(["browser", "http", "glm"]);
  });

  it("uses the same unavailable error when GLM throws", async () => {
    const readers = harness({
      glm: async () => {
        throw new Error("GLM_CODING_API_KEY is required.");
      },
    });
    const result = await run(
      { glmFallback: true, mode: "auto", ref: "article:1", url: article },
      readers.live,
    );
    expect(result).toMatchObject({ error: "Browser, HTTP and GLM Reader unavailable." });
    expect(readers.calls).toEqual(["browser", "http", "glm"]);
  });
});

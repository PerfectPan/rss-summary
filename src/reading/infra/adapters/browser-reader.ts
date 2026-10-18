import { Effect } from "effect";

import {
  validateArticleResearchUrl,
  type ReadRequest,
  type ReadResult,
} from "../../domain/document/index.js";
import type { ArticleExtract } from "../../domain/document/index.js";

export type BrowserReaderOptions = {
  browserChannel?: string;
  extract: ArticleExtract;
  fetchPage?: BrowserPageFetcher;
  headless?: boolean;
  maxChars?: number;
  timeoutMs?: number;
};

export type BrowserPageFetcher = (input: {
  browserChannel?: string;
  headless: boolean;
  timeoutMs: number;
  url: string;
}) => Effect.Effect<{ html: string; url: string }, unknown>;

const DEFAULT_MAX_CHARS = 16_000;
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Render one selected public URL in an isolated browser context and extract
 * its readable body. Failures surface as a `failed` ReadResult, never as a
 * rejected effect, matching the historical client contract.
 */
export function browserArticleResearch(
  options: BrowserReaderOptions,
): (request: ReadRequest) => Effect.Effect<ReadResult> {
  const fetchPage = options.fetchPage ?? fetchRenderedPage;
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headless = options.headless ?? true;
  return (request) => {
    const retrievedAt = new Date().toISOString();
    return Effect.gen(function* () {
      // Validation throws synchronously; route it into the error channel so the
      // catch below reports it like the historical Promise-based client did.
      const url = yield* Effect.try({
        try: () => validateArticleResearchUrl(request.url),
        catch: (cause) => cause,
      });
      const rendered = yield* fetchPage({
        browserChannel: options.browserChannel,
        headless,
        timeoutMs,
        url,
      });
      const fetchedUrl = yield* Effect.try({
        try: () => validateArticleResearchUrl(rendered.url || url),
        catch: (cause) => cause,
      });
      const extracted = yield* Effect.try({
        try: () => options.extract(rendered.html, fetchedUrl, maxChars),
        catch: (cause) => cause,
      });
      if (extracted.content.length < 80) {
        return yield* Effect.fail(new Error("article body was too short after browser extraction"));
      }
      return {
        content: extracted.content,
        fetchedUrl,
        method: "browser",
        ref: request.ref,
        retrievedAt,
        status: "ok",
        title: extracted.title,
        url,
      } satisfies ReadResult;
    }).pipe(
      Effect.catch((error: unknown) =>
        Effect.succeed({
          error: error instanceof Error ? error.message : String(error),
          method: "browser",
          ref: request.ref,
          retrievedAt,
          status: "failed",
          url: request.url,
        } satisfies ReadResult),
      ),
    );
  };
}

/* v8 ignore start -- Playwright browser automation is exercised through the Mac mini smoke path. */
function fetchRenderedPage(input: {
  browserChannel?: string;
  headless: boolean;
  timeoutMs: number;
  url: string;
}): Effect.Effect<{ html: string; url: string }, unknown> {
  return Effect.scoped(
    Effect.gen(function* () {
      const playwright = yield* Effect.promise(() => import("playwright"));
      const browser = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () => launchBrowser(playwright, input),
          catch: (cause) => cause,
        }),
        (launched) => Effect.promise(() => launched.close()),
      );
      const context = yield* Effect.tryPromise({
        try: () =>
          browser.newContext({
            userAgent: "rss-summary/0.1 article-research-browser",
          }),
        catch: (cause) => cause,
      });
      const page = yield* Effect.tryPromise({
        try: () => context.newPage(),
        catch: (cause) => cause,
      });
      yield* Effect.tryPromise({
        try: () => page.goto(input.url, { timeout: input.timeoutMs, waitUntil: "commit" }),
        catch: (cause) => cause,
      });
      yield* Effect.tryPromise({
        try: () =>
          page
            .waitForSelector(
              "article,main,[itemprop='articleBody'],[data-pagefind-body],.markdown-body,.prose",
              { timeout: input.timeoutMs },
            )
            .catch(() => undefined),
        catch: (cause) => cause,
      });
      yield* Effect.tryPromise({
        try: () =>
          page
            .waitForLoadState("networkidle", { timeout: Math.min(input.timeoutMs, 5_000) })
            .catch(() => undefined),
        catch: (cause) => cause,
      });
      const html = yield* Effect.tryPromise({
        try: () => page.content(),
        catch: (cause) => cause,
      });
      return { html, url: page.url() };
    }),
  );
}

async function launchBrowser(
  playwright: typeof import("playwright"),
  input: { browserChannel?: string; headless: boolean },
): Promise<Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>>> {
  try {
    return await playwright.chromium.launch({
      channel: input.browserChannel,
      headless: input.headless,
    });
  } catch (error) {
    if (!input.browserChannel) throw error;
    return playwright.chromium.launch({ headless: input.headless });
  }
}
/* v8 ignore stop */

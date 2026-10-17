import { Effect } from "effect";

import type { ReadRequest, ReadResult } from "../../domain/document/document.js";
import { validateArticleResearchUrl } from "../../domain/document/url-policy.js";
import type { ArticleExtract } from "./http-reader.js";

export type BrowserArticleResearchOptions = {
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
}) => Promise<{ html: string; url: string }>;

const DEFAULT_MAX_CHARS = 16_000;
const DEFAULT_TIMEOUT_MS = 30_000;

/** Render one selected public URL in an isolated browser context and extract its readable body. */
export class BrowserArticleResearchClient {
  private readonly browserChannel?: string;
  private readonly extract: ArticleExtract;
  private readonly fetchPage: BrowserPageFetcher;
  private readonly headless: boolean;
  private readonly maxChars: number;
  private readonly timeoutMs: number;

  constructor(options: BrowserArticleResearchOptions) {
    this.browserChannel = options.browserChannel;
    this.extract = options.extract;
    this.fetchPage = options.fetchPage ?? fetchRenderedPage;
    this.headless = options.headless ?? true;
    this.maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async research(request: ReadRequest): Promise<ReadResult> {
    const retrievedAt = new Date().toISOString();
    try {
      const url = validateArticleResearchUrl(request.url);
      const rendered = await this.fetchPage({
        browserChannel: this.browserChannel,
        headless: this.headless,
        timeoutMs: this.timeoutMs,
        url,
      });
      const fetchedUrl = validateArticleResearchUrl(rendered.url || url);
      const extracted = this.extract(rendered.html, fetchedUrl, this.maxChars);
      if (extracted.content.length < 80) {
        throw new Error("article body was too short after browser extraction");
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
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        method: "browser",
        ref: request.ref,
        retrievedAt,
        status: "failed",
        url: request.url,
      };
    }
  }
}

/* v8 ignore start -- Playwright browser automation is exercised through the Mac mini smoke path. */
async function fetchRenderedPage(input: {
  browserChannel?: string;
  headless: boolean;
  timeoutMs: number;
  url: string;
}): Promise<{ html: string; url: string }> {
  return Effect.runPromise(
    Effect.scoped(
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
    ),
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

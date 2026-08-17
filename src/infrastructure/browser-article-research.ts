import {
  extractArticle,
  validateArticleResearchUrl,
  type ArticleResearchRequest,
  type ArticleResearchResult,
} from "./article-research.js";

export type BrowserArticleResearchOptions = {
  browserChannel?: string;
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
  private readonly fetchPage: BrowserPageFetcher;
  private readonly headless: boolean;
  private readonly maxChars: number;
  private readonly timeoutMs: number;

  constructor(options: BrowserArticleResearchOptions = {}) {
    this.browserChannel = options.browserChannel;
    this.fetchPage = options.fetchPage ?? fetchRenderedPage;
    this.headless = options.headless ?? true;
    this.maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async research(request: ArticleResearchRequest): Promise<ArticleResearchResult> {
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
      const extracted = extractArticle(rendered.html, fetchedUrl, this.maxChars);
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
  const playwright = await import("playwright");
  const browser = await launchBrowser(playwright, input);
  try {
    const context = await browser.newContext({
      userAgent: "rss-summary/0.1 article-research-browser",
    });
    const page = await context.newPage();
    await page.goto(input.url, { timeout: input.timeoutMs, waitUntil: "commit" });
    await page
      .waitForSelector(
        "article,main,[itemprop='articleBody'],[data-pagefind-body],.markdown-body,.prose",
        {
          timeout: input.timeoutMs,
        },
      )
      .catch(() => undefined);
    await page
      .waitForLoadState("networkidle", { timeout: Math.min(input.timeoutMs, 5_000) })
      .catch(() => undefined);
    return { html: await page.content(), url: page.url() };
  } finally {
    await browser.close();
  }
}

async function launchBrowser(
  playwright: typeof import("playwright"),
  input: { browserChannel?: string; headless: boolean },
): Promise<Awaited<ReturnType<typeof playwright.chromium.launch>>> {
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

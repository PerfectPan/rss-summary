import {
  ArticleResearchClient,
  type ArticleResearchClientOptions,
  type ArticleResearchResult,
} from "../infrastructure/article-research.js";
import { BrowserArticleResearchClient } from "../infrastructure/browser-article-research.js";

export type RivusArticleResearchResult = ArticleResearchResult & {
  tool: "article-research";
};

export type ArticleResearchToolDependencies = {
  browserClient?: Pick<BrowserArticleResearchClient, "research">;
  client?: Pick<ArticleResearchClient, "research">;
};

export type ArticleResearchMode = "auto" | "browser" | "http";

/** Agent-facing, read-only research Tool for one selected source URL. */
export function createArticleResearchExecutor(
  dependencies: ArticleResearchToolDependencies = {},
): (value: unknown) => Promise<RivusArticleResearchResult> {
  const client = dependencies.client ?? new ArticleResearchClient();
  const browserClient =
    dependencies.browserClient ??
    (dependencies.client
      ? dependencies.client
      : new BrowserArticleResearchClient({
          browserChannel: process.env.RSS_ARTICLE_BROWSER_CHANNEL?.trim() || "chrome",
          headless: process.env.RSS_ARTICLE_BROWSER_HEADLESS !== "false",
          timeoutMs: readBrowserTimeoutMs(),
        }));
  return async (value) => {
    const request = parseInput(value);
    const researchRequest = { ref: request.ref, url: request.url };
    if (request.mode === "http") {
      return { ...(await client.research(researchRequest)), tool: "article-research" };
    }
    if (request.mode === "browser") {
      return { ...(await browserClient.research(researchRequest)), tool: "article-research" };
    }

    const browserResult = await browserClient.research(researchRequest);
    if (browserResult.status === "ok") {
      return { ...browserResult, tool: "article-research" };
    }
    const httpResult = await client.research(researchRequest);
    if (httpResult.status === "ok") {
      return { ...httpResult, tool: "article-research" };
    }
    return {
      ...httpResult,
      error: `browser: ${browserResult.error}; http: ${httpResult.error}`,
      tool: "article-research",
    };
  };
}

function readBrowserTimeoutMs(): number {
  const value = Number(process.env.RSS_ARTICLE_BROWSER_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 5_000 ? value : 30_000;
}

export function createArticleResearchClient(
  options: ArticleResearchClientOptions = {},
): ArticleResearchClient {
  return new ArticleResearchClient(options);
}

function parseInput(value: unknown): { mode: ArticleResearchMode; ref: string; url: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Article research input must be an object.");
  }
  const record = value as Record<string, unknown>;
  const ref = typeof record.ref === "string" ? record.ref.trim() : "";
  const url = typeof record.url === "string" ? record.url.trim() : "";
  const mode = record.mode === undefined ? "auto" : record.mode;
  if (!ref) throw new Error("Article research requires ref.");
  if (!url) throw new Error("Article research requires url.");
  if (mode !== "auto" && mode !== "browser" && mode !== "http") {
    throw new Error("Article research mode must be auto, browser, or http.");
  }
  return { mode, ref, url };
}

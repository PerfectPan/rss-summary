import { GlmResearchClient } from "../infrastructure/glm-research.js";
import {
  ArticleResearchClient,
  validateResearchUrl,
  isVideoResearchUrl,
  type ArticleResearchClientOptions,
  type ArticleResearchResult,
} from "../infrastructure/article-research.js";
import { BrowserArticleResearchClient } from "../infrastructure/browser-article-research.js";
import { VideoResearchClient } from "../infrastructure/video-research.js";

export type RivusArticleResearchResult = ArticleResearchResult & {
  tool: "article-research";
};

export type ArticleResearchToolDependencies = {
  env?: NodeJS.ProcessEnv;
  glmClient?: Pick<GlmResearchClient, "read">;
  browserClient?: Pick<BrowserArticleResearchClient, "research">;
  client?: Pick<ArticleResearchClient, "research">;
  videoClient?: Pick<VideoResearchClient, "research">;
};

export type ArticleResearchMode = "auto" | "browser" | "http";

/** Agent-facing, read-only research Tool for one selected source URL. */
export function createArticleResearchExecutor(
  dependencies: ArticleResearchToolDependencies = {},
): (value: unknown) => Promise<RivusArticleResearchResult> {
  const env = dependencies.env ?? process.env;
  const client = dependencies.client ?? new ArticleResearchClient();
  const videoClient = dependencies.videoClient ?? new VideoResearchClient({ env });
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
    try {
      validateResearchUrl(request.url);
    } catch (error) {
      return {
        ...researchRequest,
        error: error instanceof Error ? error.message : String(error),
        retrievedAt: new Date().toISOString(),
        status: "failed",
        tool: "article-research",
      };
    }
    if (isVideoResearchUrl(request.url)) {
      return { ...(await videoClient.research(researchRequest)), tool: "article-research" };
    }
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
    if (env.RSS_ARTICLE_GLM_FALLBACK === "true") {
      try {
        const glm =
          dependencies.glmClient ?? new GlmResearchClient({ apiKey: env.GLM_CODING_API_KEY ?? "" });
        const page = await glm.read(request.url);
        if (page.content.trim().length < 80) throw new Error("Reader body too short");
        return {
          ...researchRequest,
          content: page.content,
          fetchedUrl: page.url,
          retrievedAt: new Date().toISOString(),
          title: page.title,
          status: "ok",
          method: "glm",
          tool: "article-research",
        };
      } catch {
        return {
          ...httpResult,
          error: "Browser, HTTP and GLM Reader unavailable.",
          tool: "article-research",
        };
      }
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

import { Effect } from "effect";

import {
  ReadingLive,
  readOriginal,
  type GlmPage,
  type ReadOriginalResult,
  type ReadRequest,
  type ReadResult,
} from "../reading/index.js";

export type RivusArticleResearchResult = ReadOriginalResult & {
  tool: "article-research";
};

type ResearchClient = {
  research: (request: ReadRequest) => Promise<ReadResult>;
};

export type ArticleResearchToolDependencies = {
  env?: NodeJS.ProcessEnv;
  glmClient?: { read: (url: string) => Promise<GlmPage> };
  browserClient?: ResearchClient;
  client?: ResearchClient;
  videoClient?: ResearchClient;
};

export type ArticleResearchMode = "auto" | "browser" | "http";

/** Agent-facing, read-only research Tool for one selected source URL. */
export function createArticleResearchExecutor(
  dependencies: ArticleResearchToolDependencies = {},
): (value: unknown) => Promise<RivusArticleResearchResult> {
  const env = dependencies.env ?? process.env;
  const layer = ReadingLive({
    apiKey: env.GLM_CODING_API_KEY ?? "",
    browserChannel: process.env.RSS_ARTICLE_BROWSER_CHANNEL?.trim() || "chrome",
    browserResearch: dependencies.browserClient?.research ?? dependencies.client?.research,
    browserTimeoutMs: readBrowserTimeoutMs(),
    glmRead: dependencies.glmClient?.read,
    headless: process.env.RSS_ARTICLE_BROWSER_HEADLESS !== "false",
    httpResearch: dependencies.client?.research,
    videoEnv: env,
    videoResearch: dependencies.videoClient?.research,
  });
  return async (value) => {
    const request = parseInput(value);
    const result = await Effect.runPromise(
      readOriginal({
        glmFallback: env.RSS_ARTICLE_GLM_FALLBACK === "true",
        mode: request.mode,
        ref: request.ref,
        url: request.url,
      }).pipe(Effect.provide(layer)),
    );
    return { ...result, tool: "article-research" };
  };
}

function readBrowserTimeoutMs(): number {
  const value = Number(process.env.RSS_ARTICLE_BROWSER_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 5_000 ? value : 30_000;
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

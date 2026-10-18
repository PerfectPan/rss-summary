import type { RivusToolDescriptor } from "@rivus/agent";
import { Effect } from "effect";

import {
  readOriginal,
  type GlmPage,
  type ReadOriginalResult,
  type ReadRequest,
  type ReadResult,
} from "../../../reading/index.js";
import { ReadingLive } from "../../layers.js";
import { loadEnvConfig } from "../../config/env.js";
import { runPluginEffect } from "../../runtime.js";

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
  return async (value) => {
    const request = parseInput(value);
    const env = dependencies.env ?? process.env;
    const base = await runPluginEffect(loadEnvConfig(env));
    const browserInjection = dependencies.browserClient?.research ?? dependencies.client?.research;
    const layer = ReadingLive({
      apiKey: base.glmCodingApiKey,
      browserChannel: base.articleResearch.browserChannel,
      browserResearch: browserInjection
        ? (request) => Effect.promise(() => browserInjection(request))
        : undefined,
      browserTimeoutMs: base.articleResearch.browserTimeoutMs,
      glmRead: dependencies.glmClient?.read,
      headless: base.articleResearch.browserHeadless,
      httpResearch: dependencies.client?.research,
      videoEnv: env,
      videoResearch: dependencies.videoClient?.research,
    });
    const result = await runPluginEffect(
      readOriginal({
        glmFallback: base.articleResearch.glmFallback,
        mode: request.mode,
        ref: request.ref,
        url: request.url,
      }),
      { layer },
    );
    return { ...result, tool: "article-research" };
  };
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

export const researchToolDescriptor: Pick<
  RivusToolDescriptor,
  "description" | "digest" | "idempotency" | "inputSchema" | "risk" | "version"
> = {
  description:
    "Read a selected article or video: extract text, captions or audio transcription, inspect key frames with a vision model, and retain source materials",
  digest: "sha256:rss-summary-research-article-v3",

  idempotency: "none",
  inputSchema: {
    additionalProperties: false,
    properties: {
      mode: { default: "auto", enum: ["auto", "browser", "http"], type: "string" },
      ref: { minLength: 1, type: "string" },
      url: { format: "uri", type: "string" },
    },
    required: ["ref", "url"],
    type: "object",
  },
  risk: "observe",
  version: "1.2.0",
};

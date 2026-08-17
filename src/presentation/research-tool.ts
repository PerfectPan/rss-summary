import {
  ArticleResearchClient,
  type ArticleResearchClientOptions,
  type ArticleResearchResult,
} from "../infrastructure/article-research.js";

export type RivusArticleResearchResult = ArticleResearchResult & {
  tool: "article-research";
};

export type ArticleResearchToolDependencies = {
  client?: Pick<ArticleResearchClient, "research">;
};

/** Agent-facing, read-only research Tool for one selected source URL. */
export function createArticleResearchExecutor(
  dependencies: ArticleResearchToolDependencies = {},
): (value: unknown) => Promise<RivusArticleResearchResult> {
  const client = dependencies.client ?? new ArticleResearchClient();
  return async (value) => {
    const request = parseInput(value);
    return { ...(await client.research(request)), tool: "article-research" };
  };
}

export function createArticleResearchClient(
  options: ArticleResearchClientOptions = {},
): ArticleResearchClient {
  return new ArticleResearchClient(options);
}

function parseInput(value: unknown): { ref: string; url: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Article research input must be an object.");
  }
  const record = value as Record<string, unknown>;
  const ref = typeof record.ref === "string" ? record.ref.trim() : "";
  const url = typeof record.url === "string" ? record.url.trim() : "";
  if (!ref) throw new Error("Article research requires ref.");
  if (!url) throw new Error("Article research requires url.");
  return { ref, url };
}

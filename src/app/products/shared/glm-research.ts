import { GlmSearchClient, type ResearchSearchResult } from "../../../acquisition/index.js";
import { readGlmPage, type GlmPage } from "../../../reading/index.js";

export type ResearchPage = GlmPage;

/** GLM search plus page reading, as used by the hybrid fallback. */
export type GlmResearch = {
  search: (
    query: string,
    domains: string[],
    recency?: "noLimit" | "oneDay" | "oneWeek",
    observe?: (counts: { rawResults: number; domainRejected: number }) => void,
    location?: "cn" | "us",
  ) => Promise<ResearchSearchResult[]>;
  read: (url: string) => Promise<ResearchPage>;
};

/** Compose the GLM research surface from acquisition search and reading. */
export function createGlmResearch(options: {
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): GlmResearch {
  if (!options.apiKey.trim()) throw new Error("GLM_CODING_API_KEY is required.");
  const apiKey = options.apiKey.trim();
  const client = new GlmSearchClient({
    apiKey,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  });
  return {
    search: (query, domains, recency, observe, location) =>
      client.search(query, domains, recency, observe, location),
    read: (url) =>
      readGlmPage(url, {
        apiKey,
        ...(options.fetch ? { fetch: options.fetch } : {}),
        ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      }),
  };
}

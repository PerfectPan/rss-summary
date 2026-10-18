import { Effect, Layer } from "effect";

import { SearchProvider, type SearchInput, type SearchPage } from "../../../acquisition/index.js";

import { callMcpTool } from "../mcp-client.js";
import { allowedSearchDomains } from "../public-url.js";
import { parseGlmSearchResults, type ResearchSearchResult } from "./mapper.js";

type Options = {
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

const searchEndpoint = "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp";

export class GlmSearchClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly apiKey: string;

  constructor(options: Options) {
    if (!options.apiKey.trim()) throw new Error("GLM_CODING_API_KEY is required.");
    this.apiKey = options.apiKey.trim();
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async search(
    query: string,
    domains: string[],
    recency: "noLimit" | "oneDay" | "oneWeek" = "noLimit",
    observe?: (counts: { rawResults: number; domainRejected: number }) => void,
    location: "cn" | "us" = "cn",
  ): Promise<ResearchSearchResult[]> {
    if (!query.trim() || query.length > 70) {
      throw new Error("Search query must contain 1 to 70 characters.");
    }
    const allowed = allowedSearchDomains(domains);
    const value = await callMcpTool(
      {
        endpoint: searchEndpoint,
        apiKey: this.apiKey,
        fetchImpl: this.fetchImpl,
        timeoutMs: this.timeoutMs,
        toolFailedMessage: "GLM search tool failed.",
      },
      "web_search_prime",
      {
        search_query: query.trim(),
        location,
        ...(allowed.length === 1 ? { search_domain_filter: allowed[0] } : {}),
        content_size: "medium",
        search_recency_filter: recency,
      },
    );
    const parsed = parseGlmSearchResults(value, allowed);
    observe?.({ rawResults: parsed.rawResults, domainRejected: parsed.domainRejected });
    return parsed.results;
  }

  /** News-shaped page for the provider port. Hybrid search keeps using `search`. */
  async searchPage(input: SearchInput): Promise<SearchPage> {
    const results = await this.search(input.query, [], "noLimit");
    return {
      provider: "glm",
      resultCount: results.length,
      results: results.map((result, index) => ({
        id: result.url,
        title: result.title,
        url: result.url,
        snippet: result.snippet,
        rankPosition: index + 1,
      })),
    };
  }
}

export const GlmSearchLive = (options: Options): Layer.Layer<SearchProvider> => {
  const client = new GlmSearchClient(options);
  return Layer.succeed(SearchProvider, {
    search: (input) =>
      Effect.tryPromise({
        try: () => client.searchPage(input),
        catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
      }),
  });
};

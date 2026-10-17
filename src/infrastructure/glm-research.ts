import { GlmSearchClient } from "../acquisition/infra/adapters/glm-search.js";
import { readGlmPage, type GlmPage } from "../reading/index.js";

export type { ResearchSearchResult } from "../acquisition/domain/item/adapters/glm.js";

export type ResearchPage = GlmPage;

type Options = {
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

/** Search moves to acquisition. Reading stays on the existing page reader. */
export class GlmResearchClient {
  private readonly searchClient: GlmSearchClient;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: Options) {
    if (!options.apiKey.trim()) throw new Error("GLM_CODING_API_KEY is required.");
    this.apiKey = options.apiKey.trim();
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.searchClient = new GlmSearchClient({
      apiKey: this.apiKey,
      fetch: this.fetchImpl,
      timeoutMs: this.timeoutMs,
    });
  }

  search(
    query: string,
    domains: string[],
    recency: "noLimit" | "oneDay" | "oneWeek" = "noLimit",
    observe?: (counts: { rawResults: number; domainRejected: number }) => void,
    location: "cn" | "us" = "cn",
  ) {
    return this.searchClient.search(query, domains, recency, observe, location);
  }

  read(input: string): Promise<ResearchPage> {
    return readGlmPage(input, {
      apiKey: this.apiKey,
      fetch: this.fetchImpl,
      timeoutMs: this.timeoutMs,
    });
  }
}

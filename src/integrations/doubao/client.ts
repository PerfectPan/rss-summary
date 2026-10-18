import type { SearchInput, SearchPage } from "../../acquisition/index.js";

import { DoubaoSearchError, parseDoubaoResponse } from "./dto.js";

type DoubaoSearchClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type SearchInputContract = {
  query: string;
  count: number;
  day: string;
  sinceDay?: string;
  sourcePolicy: string;
};

export function validateDoubaoInput(input: SearchInputContract): void {
  if (input.query.trim() === "" || input.query.length > 100) {
    throw new Error("Doubao search query must contain 1 to 100 characters.");
  }
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 50) {
    throw new Error("Doubao web search count must be between 1 and 50.");
  }
  if (
    input.sinceDay &&
    (!/^\d{4}-\d{2}-\d{2}$/u.test(input.sinceDay) || input.sinceDay > input.day)
  ) {
    throw new Error("Invalid search start date.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.day)) {
    throw new Error("Doubao search day must use YYYY-MM-DD.");
  }
}

export class DoubaoSearchClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: DoubaoSearchClientOptions) {
    if (options.apiKey.trim() === "") throw new Error("DOUBAO_SEARCH_API_KEY is required.");
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://open.feedcoopapi.com/search_api/web_search";
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async search(input: SearchInput): Promise<SearchPage> {
    validateDoubaoInput(input);
    const filter: Record<string, unknown> = { NeedUrl: true };
    if (input.sourcePolicy === "official") filter.AuthInfoLevel = 1;

    let response: Response;
    try {
      response = await this.fetchImpl(this.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          Query: input.query,
          SearchType: "web",
          Count: input.count,
          Filter: filter,
          TimeRange: `${input.sinceDay ?? input.day}..${input.day}`,
          // Topic queries already encode one bounded event intent. Rewriting broadens them back
          // into generic discovery queries and lowers precision.
          QueryControl: { QueryRewrite: false },
          ContentFormats: "markdown",
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      throw new DoubaoSearchError("network_error", errorText(cause));
    }
    const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
    if (!response.ok) {
      if (response.status === 429) {
        throw new DoubaoSearchError("http_429", "HTTP 429", { retryAfterMs });
      }
      throw new DoubaoSearchError(`http_${response.status}`, `HTTP ${response.status}`);
    }

    return parseDoubaoResponse(await response.json(), retryAfterMs).page;
  }
}

function errorText(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.max(0, date - Date.now());
}

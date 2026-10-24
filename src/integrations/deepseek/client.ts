import type { SearchInput, SearchPage } from "../../acquisition/index.js";

import { DeepSeekSearchError, parseDeepSeekResponse } from "./dto.js";

type DeepSeekSearchClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type SearchInputContract = {
  query: string;
  count: number;
};

/** The endpoint rejects queries longer than 128 characters. */
const maxOutgoingQueryLength = 128;

export function validateDeepSeekInput(input: SearchInputContract): void {
  if (input.query.trim() === "" || input.query.length > 128) {
    throw new Error("DeepSeek search query must contain 1 to 128 characters.");
  }
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 50) {
    throw new Error("DeepSeek search count must be between 1 and 50.");
  }
}

/**
 * The endpoint has no time-range parameter, but its query text accepts the
 * `after:` operator with Beijing calendar-day boundaries, and without it
 * relevance dominates over recency. Append the window's first calendar day
 * (as seen from the caller's timezone offset) unless the query already
 * constrains the window itself, truncating the keywords — never the operator —
 * to stay within the length limit.
 */
export function deepSeekOutgoingQuery(query: string, sinceDay?: string): string {
  if (!sinceDay) return query;
  if (/(?:^|\s)after:\d/u.test(query)) return query;
  const operator = `after:${sinceDay}`;
  const keywordBudget = maxOutgoingQueryLength - operator.length - 1;
  const keywords = query.trimEnd().slice(0, Math.max(0, keywordBudget)).trimEnd();
  return `${keywords} ${operator}`;
}

export class DeepSeekSearchClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: DeepSeekSearchClientOptions) {
    if (options.apiKey.trim() === "") throw new Error("DEEPSEEK_API_KEY is required.");
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.deepseek.com/v1/tools/search";
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async search(input: SearchInput): Promise<SearchPage> {
    validateDeepSeekInput(input);
    // The `after:` operator only narrows results; callers still re-check
    // publication times against their exact window when consuming the page.
    const outgoingQuery = deepSeekOutgoingQuery(input.query, input.sinceDay);
    let response: Response;
    try {
      response = await this.fetchImpl(this.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: outgoingQuery, count: input.count }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      throw new DeepSeekSearchError("network_error", errorText(cause));
    }
    const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
    if (!response.ok) {
      if (response.status === 429) {
        throw new DeepSeekSearchError("http_429", "HTTP 429", { retryAfterMs });
      }
      throw new DeepSeekSearchError(`http_${response.status}`, `HTTP ${response.status}`);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new DeepSeekSearchError("invalid_response", errorText(cause), { retryAfterMs });
    }
    return parseDeepSeekResponse(body, retryAfterMs).page;
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

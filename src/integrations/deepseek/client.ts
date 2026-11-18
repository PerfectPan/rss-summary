import type { SearchInput, SearchPage } from "../../acquisition/index.js";

import { errorText, postSearchJson } from "../shared/search-plumbing.js";
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

/** @internal */
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
 * @internal
 */
export function deepSeekOutgoingQuery(query: string, sinceDay?: string): string {
  if (!sinceDay) {
    return query;
  }
  if (/(?:^|\s)after:\d/u.test(query)) {
    return query;
  }
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
    if (options.apiKey.trim() === "") {
      throw new Error("DEEPSEEK_API_KEY is required.");
    }
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
    const { response, retryAfterMs } = await postSearchJson({
      url: this.baseUrl,
      apiKey: this.apiKey,
      timeoutMs: this.timeoutMs,
      body: { query: outgoingQuery, count: input.count },
      fetchImpl: this.fetchImpl,
      error: (code, message, options) => new DeepSeekSearchError(code, message, options)
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new DeepSeekSearchError("invalid_response", errorText(cause), { retryAfterMs });
    }
    return parseDeepSeekResponse(body, retryAfterMs).page;
  }
}

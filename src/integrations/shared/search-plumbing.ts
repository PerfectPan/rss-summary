import { Effect, Layer } from "effect";

import { SearchProvider, type NewsSearchError, type SearchInput, type SearchPage } from "../../acquisition/index.js";

export function errorText(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1_000);
  }
  const date = Date.parse(value);
  if (!Number.isFinite(date)) {
    return undefined;
  }
  return Math.max(0, date - Date.now());
}

/** How a search client constructs its error: the provider's `NewsSearchError` subclass. */
export type SearchErrorFactory = (
  code: string,
  message: string,
  options?: { retryAfterMs?: number }
) => NewsSearchError;

/**
 * The POST every search API speaks: a Bearer JSON body under a timeout, failures thrown as the provider's error, and
 * the `Retry-After` hint carried out so the caller's body parse and its errors carry it on.
 */
export async function postSearchJson(options: {
  url: string;
  apiKey: string;
  timeoutMs: number;
  body: unknown;
  fetchImpl: typeof fetch;
  error: SearchErrorFactory;
}): Promise<{ response: Response; retryAfterMs: number | undefined }> {
  let response: Response;
  try {
    response = await options.fetchImpl(options.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeoutMs)
    });
  } catch (cause) {
    throw options.error("network_error", errorText(cause));
  }
  const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
  if (!response.ok) {
    if (response.status === 429) {
      throw options.error("http_429", "HTTP 429", { retryAfterMs });
    }
    throw options.error(`http_${response.status}`, `HTTP ${response.status}`);
  }
  return { response, retryAfterMs };
}

/** The Effect layer every search client lives behind: its `search` over a checked `Error`. */
export function searchProviderLayer(client: {
  search: (input: SearchInput) => Promise<SearchPage>;
}): Layer.Layer<SearchProvider> {
  return Layer.succeed(SearchProvider, {
    search: (input) =>
      Effect.tryPromise({
        try: () => client.search(input),
        catch: (cause) => (cause instanceof Error ? cause : new Error(errorText(cause)))
      })
  });
}

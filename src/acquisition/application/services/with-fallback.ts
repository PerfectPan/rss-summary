import { Effect } from "effect";

import {
  isSearchFailure,
  type SearchInput,
  type SearchPage,
  type SearchSourcePolicy,
} from "../../domain/search/index.js";

/** A provider's search entry, matching the SearchProvider port. */
export type ProviderSearch = (input: SearchInput) => Effect.Effect<SearchPage, unknown>;

export type FallbackSearchProvider = {
  search: ProviderSearch;
  /**
   * Source policies this provider can serve. A query whose sourcePolicy is
   * outside the set never falls back; the primary failure stands.
   */
  sourcePolicies: readonly SearchSourcePolicy[];
};

/**
 * Primary failure codes that hand a query to a fallback provider. Only source
 * outages appear here — local spending boundaries and program errors do not,
 * because a local cap must not quietly spend another provider's allowance:
 * - `network_error`: the primary request never completed; the HTTP clients
 *   surface request aborts (timeouts included) this way.
 * - `http_429`: primary rate limiting that still failed after `withRetry`
 *   honored its schedule.
 * - `http_5`: stands for the whole 5xx family (`http_500` … `http_599`).
 * - `invalid_response`: a 2xx primary response failed provider decoding.
 * - `grok_timeout`: the CLI search process was killed at its timeout.
 * - `grok_call_limit`: the CLI search exceeded its native X call limit.
 * - `grok_output_limit`: the CLI search produced more output than allowed.
 * - `grok_not_found`: the CLI search executable is missing.
 * - `grok_cli_failed`: the CLI search exited non-zero for another reason.
 * - `grok_invalid_response`: the CLI search stream lacked a complete receipt.
 * - `grok_source_policy`: the CLI search cannot serve this query's policy.
 * - `10406`: account-quota exhaustion on the primary web-search provider.
 */
export const fallbackTriggerCodes: readonly string[] = [
  "network_error",
  "http_429",
  "http_5",
  "invalid_response",
  "grok_timeout",
  "grok_call_limit",
  "grok_output_limit",
  "grok_not_found",
  "grok_cli_failed",
  "grok_invalid_response",
  "grok_source_policy",
  "10406",
];

/** Whether a primary failure is a source outage a fallback may recover from. */
export function shouldFallbackOnSourceOutage(error: unknown): boolean {
  return isSearchFailure(error) && isTriggerCode(error.code);
}

function isTriggerCode(code: string): boolean {
  return (
    fallbackTriggerCodes.includes(code) ||
    (/^http_5\d{2}$/u.test(code) && fallbackTriggerCodes.includes("http_5"))
  );
}

/**
 * Wrap a primary provider with a fallback. The fallback runs only for source
 * outages (`shouldFallback`) on queries the fallback can serve; every other
 * failure — local budget boundaries, deferred queries, program errors —
 * propagates unchanged. When the fallback itself fails, the primary failure is
 * the truth about the configured source, so that is the error downstream
 * degradation (retry circuits, the model-search complement) reacts to. A successful
 * fallback marks the page with the primary code that triggered the switch.
 */
export function withFallback(
  primary: ProviderSearch,
  fallback: FallbackSearchProvider,
  shouldFallback: (error: unknown) => boolean,
): ProviderSearch {
  return (input) =>
    Effect.catch(primary(input), (error: unknown) => {
      if (!shouldFallback(error)) return Effect.fail(error);
      if (!fallback.sourcePolicies.includes(input.sourcePolicy)) return Effect.fail(error);
      const triggeredBy = isSearchFailure(error) ? error.code : "unknown";
      return Effect.catch(
        Effect.map(fallback.search(input), (page) => ({
          ...page,
          providerFallback: { triggeredBy },
        })),
        () => Effect.fail(error),
      );
    });
}

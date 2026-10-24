import { Effect } from "effect";

import { canonicalizeUrl } from "../../../kernel/index.js";
import {
  isSearchFailure,
  type MergedSearchSource,
  type SearchPage,
  type SearchResult,
} from "../../domain/search/index.js";
import type { ProviderSearch } from "./with-fallback.js";

/** One source feeding a merged search. */
export type SearchSource = {
  /**
   * Label recorded per source on the merged page. Naming a concrete service is
   * the composer's choice; this service stays source-neutral.
   */
  readonly name: string;
  readonly search: ProviderSearch;
};

/**
 * Search several sources for one query in parallel and merge their pages:
 * results deduplicate by canonical URL in source order (the first source wins),
 * every kept result records which source contributed it, and the page carries
 * each source's counts or failure code for the audit. Any successful source
 * makes the merge succeed; only when every source fails does it fail, with the
 * primary's (first source's) error, because retries, circuits and downstream
 * degradation react to the configured source. A primary failure a later source
 * survived is disclosed through `providerFallback`, matching `withFallback`.
 */
export function mergeSearches(sources: readonly SearchSource[]): ProviderSearch {
  if (sources.length === 0) throw new Error("mergeSearches requires at least one source.");
  return (input) =>
    Effect.gen(function* () {
      const outcomes = yield* Effect.all(
        sources.map(({ search }) => Effect.result(search(input))),
        { concurrency: sources.length },
      );
      const records: MergedSearchSource[] = [];
      const seen = new Set<string>();
      const results: SearchResult[] = [];
      let base: SearchPage | undefined;
      for (const [index, source] of sources.entries()) {
        const outcome = outcomes[index]!;
        if (outcome._tag === "Failure") {
          records.push({
            source: source.name,
            status: "failed",
            fetched: 0,
            contributed: 0,
            code: isSearchFailure(outcome.failure) ? outcome.failure.code : "unknown",
          });
          continue;
        }
        base ??= outcome.success;
        let contributed = 0;
        for (const result of outcome.success.results) {
          const identity = canonicalizeUrl(result.url) ?? result.url;
          if (seen.has(identity)) continue;
          seen.add(identity);
          contributed += 1;
          results.push(result.source === undefined ? { ...result, source: source.name } : result);
        }
        records.push({
          source: source.name,
          status: "ok",
          fetched: outcome.success.results.length,
          contributed,
        });
      }
      const primary = outcomes[0]!;
      const everySourceFailed = outcomes.every((outcome) => outcome._tag === "Failure");
      if (primary._tag === "Failure" && everySourceFailed) {
        // Every source failed; the primary (first) source owns the failure.
        return yield* Effect.fail(primary.failure);
      }
      const primaryTrigger = primary._tag === "Failure" ? primary.failure : undefined;
      return yield* Effect.succeed({
        ...base!,
        resultCount: results.length,
        results,
        mergedSources: records,
        ...(primaryTrigger !== undefined
          ? {
              providerFallback: {
                triggeredBy: isSearchFailure(primaryTrigger) ? primaryTrigger.code : "unknown",
              },
            }
          : {}),
      });
    });
}

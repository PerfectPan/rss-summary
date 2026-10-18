import { Effect } from "effect";

import type { SearchPage } from "../../domain/search/search.js";

export type SearchSettlement =
  | { readonly _tag: "Fulfilled"; readonly value: SearchPage }
  | { readonly _tag: "Rejected"; readonly reason: unknown };

/**
 * Pull-index workers, matching the historical pool: each worker takes the next
 * index before awaiting, so the first `concurrency` requests start together and
 * a later request starts only after one of them finishes. `Effect.forEach`
 * isolates failures only after they are wrapped; this pool does that wrap and
 * keeps the same start order.
 */
export function settleSearches<T>(
  requests: readonly T[],
  execute: (request: T) => Effect.Effect<SearchPage, unknown>,
  concurrency: number,
): Effect.Effect<SearchSettlement[]> {
  return Effect.gen(function* () {
    const settled: SearchSettlement[] = Array.from({ length: requests.length });
    let nextIndex = 0;
    const worker = Effect.gen(function* () {
      while (nextIndex < requests.length) {
        const index = nextIndex;
        nextIndex += 1;
        const outcome = yield* Effect.result(execute(requests[index]!));
        settled[index] =
          outcome._tag === "Success"
            ? { _tag: "Fulfilled", value: outcome.success }
            : { _tag: "Rejected", reason: outcome.failure };
      }
    });
    const workers = Math.min(Math.max(concurrency, 0), requests.length);
    if (workers === 0) return settled;
    yield* Effect.all(
      Array.from({ length: workers }, () => worker),
      { concurrency: "unbounded" },
    );
    return settled;
  });
}

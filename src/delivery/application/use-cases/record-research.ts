import { Effect } from "effect";

import { markResearched } from "../../domain/ledger/index.js";
import { FeedStateStore } from "../ports.js";

export type ResearchSuggestion = {
  key: string;
  decision?: string;
  reason?: string;
};

/**
 * Record research decisions in the ledger under their stable keys. All
 * suggestions share one `at` timestamp, matching the historical file format.
 */
export function recordResearch(input: {
  readonly stateFile: string;
  readonly suggestions: readonly ResearchSuggestion[];
  readonly at: string;
}): Effect.Effect<void, Error, FeedStateStore> {
  return Effect.gen(function* () {
    const store = yield* FeedStateStore;
    const state = yield* store.load(input.stateFile);
    let next = state;
    for (const suggestion of input.suggestions) {
      next = markResearched(next, suggestion.key, {
        at: input.at,
        decision: suggestion.decision,
        reason: suggestion.reason,
      });
    }
    yield* store.save(input.stateFile, next);
  });
}

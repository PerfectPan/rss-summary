import type { FeedState } from "../../domain/ledger/index.js";

/**
 * Decode raw parsed JSON into a `FeedState`, byte-compatible with the
 * historical `loadFeedState`: sections that are undefined or null become
 * empty objects, every other parsed value passes through untouched, and
 * unknown top-level fields are dropped. Deliberately no Schema validation —
 * rejecting files the old loader accepted would change CLI behavior; tighten
 * this only as an explicit, separately reviewed change.
 */
export function decodeFeedState(raw: unknown): FeedState {
  const parsed = raw as Partial<FeedState>;
  return {
    seen: parsed.seen ?? {},
    researched: parsed.researched ?? {},
  };
}

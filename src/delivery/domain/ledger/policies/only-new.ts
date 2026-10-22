import type { FeedState } from "../value-objects/feed-state.js";

/** Keep items that have at least one event id not yet recorded as delivered. */
export function filterUndelivered<T>(
  items: readonly T[],
  idsOf: (item: T) => readonly string[],
  state: FeedState,
): T[] {
  return items.filter((item) => idsOf(item).some((id) => id && !state.seen[id]));
}

/** Keep items whose research key has no research record yet. */
export function filterUnresearched<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  state: FeedState,
): T[] {
  return items.filter((item) => !state.researched[keyOf(item)]);
}

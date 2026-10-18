import type { CachedPage, CacheRequest } from "../value-objects/budget.js";

/**
 * One stored answer inside the SearchBudget's cache. Its cache key is a local
 * identity inside the aggregate: an entry is created and expired only by the
 * root's `remember` transition, read only through the root's `findCache`, and
 * saved with the aggregate's snapshot.
 */
export type CacheEntry = {
  readonly request: CacheRequest;
  readonly fetchedAt: string;
  readonly page: CachedPage;
};

/** A cached answer is usable only after it was fetched and before its TTL ends. */
export function isFresh(entry: CacheEntry, instant: number, ttlMs: number): boolean {
  const age = instant - Date.parse(entry.fetchedAt);
  return age >= 0 && age < ttlMs;
}

/**
 * A stored request answers the asked one when it searched the same call —
 * provider, query, count, source policy, window — and its day range covers the
 * asked days: the stored `sinceDay` is at or before the asked start and the
 * stored `day` at or after the asked day.
 */
export function matchesRequest(entry: CacheEntry, request: CacheRequest): boolean {
  return (
    entry.request.provider === request.provider &&
    entry.request.query === request.query &&
    entry.request.count === request.count &&
    entry.request.sourcePolicy === request.sourcePolicy &&
    entry.request.window?.since === request.window?.since &&
    entry.request.window?.until === request.window?.until &&
    entry.request.sinceDay <= request.sinceDay &&
    entry.request.day >= request.day
  );
}

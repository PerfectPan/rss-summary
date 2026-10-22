import type { CacheEntry } from "../entities/cache-entry.js";
import type { BudgetUsage } from "../index.js";
import type { SearchPage } from "../../search/index.js";

/**
 * The structural cache rule: a page is storable only when nothing about it is
 * a composed or externally verified result (no fallback marker, no per-result
 * source verification). Whether the provider's pages may be cached at all is
 * a capability the wiring declares; this predicate adds the shape rules on
 * top.
 */
export function cacheablePage(page: SearchPage): boolean {
  return (
    page.fallback === undefined &&
    page.results.every((result) => result.sourceVerification === undefined)
  );
}

/**
 * Cache hits return a detached copy so a caller cannot mutate the stored page.
 * Cached pages are JSON-safe, so a JSON round-trip clones any provider
 * receipt and every result without naming a provider's fields.
 */
export function presentCachedPage(entry: CacheEntry, usage: BudgetUsage): SearchPage {
  const page = JSON.parse(JSON.stringify(entry.page)) as SearchPage;
  return {
    ...page,
    searchUsage: { ...usage, source: "cache", fetchedAt: entry.fetchedAt },
  };
}

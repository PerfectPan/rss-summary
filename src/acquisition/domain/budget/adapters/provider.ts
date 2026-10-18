import type { CacheEntry } from "../entities/cache-entry.js";
import type { BudgetUsage } from "../index.js";
import type { SearchPage } from "../../search/index.js";

/** CLI identities keep their full string. HTTP identities drop credentials and queries. */
export const cliIdentity = /^grok:\/\/cli\/v1\/[a-zA-Z0-9._-]+$/u;

export function normalizeProvider(value: string): string {
  if (cliIdentity.test(value)) return value;
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("News search provider must be an HTTP URL or a Grok CLI identity.");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/u, "")}`;
}

/**
 * Cache hits return a detached copy so a caller cannot mutate the stored page.
 * Cached pages are JSON-safe, so a JSON round-trip clones the audit receipt
 * and every result without naming any provider's field.
 */
export function presentCachedPage(entry: CacheEntry, usage: BudgetUsage): SearchPage {
  const page = JSON.parse(JSON.stringify(entry.page)) as SearchPage;
  return {
    ...page,
    searchUsage: { ...usage, source: "cache", fetchedAt: entry.fetchedAt },
  };
}

export function isCacheablePage(page: SearchPage): boolean {
  return (
    (page.provider === undefined || page.provider === "doubao" || page.provider === "grok") &&
    page.fallback === undefined &&
    page.results.every((result) => result.sourceVerification === undefined)
  );
}

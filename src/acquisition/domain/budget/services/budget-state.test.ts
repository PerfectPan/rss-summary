import { describe, expect, it } from "vite-plus/test";

import {
  findCache,
  isFresh,
  type BudgetState,
  type CacheEntry,
  type CacheRequest,
} from "../index.js";

function request(overrides: Partial<CacheRequest> = {}): CacheRequest {
  return {
    provider: "https://search.example/web",
    query: "release",
    count: 1,
    day: "2026-09-29",
    sinceDay: "2026-09-29",
    sourcePolicy: "news",
    ...overrides,
  };
}

describe("budget state lookups", () => {
  it("matches a covering cache window and expires at the TTL boundary", () => {
    const entry: CacheEntry = {
      request: request({ sinceDay: "2026-09-25", day: "2026-09-30" }),
      fetchedAt: "2026-09-29T03:00:00.000Z",
      page: { resultCount: 0, results: [] },
    };
    const state: BudgetState = {
      version: 1,
      timezoneOffset: "+08:00",
      daily: {},
      cache: { k: entry },
    };
    const fetched = Date.parse(entry.fetchedAt);
    expect(findCache(state, request({ sinceDay: "2026-09-28" }), fetched, 60_000)).toBe(entry);
    expect(findCache(state, request({ sinceDay: "2026-09-24" }), fetched, 60_000)).toBeUndefined();
    expect(findCache(state, request({ day: "2026-10-01" }), fetched, 60_000)).toBeUndefined();
    expect(isFresh(entry, fetched + 59_999, 60_000)).toBe(true);
    expect(isFresh(entry, fetched + 60_000, 60_000)).toBe(false);
    expect(isFresh(entry, fetched - 1, 60_000)).toBe(false);
  });
});

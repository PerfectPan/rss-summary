import { describe, expect, it } from "vite-plus/test";

import type { CacheRequest } from "../value-objects/budget.js";
import { isFresh, matchesRequest, type CacheEntry } from "./cache-entry.js";

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

const entry: CacheEntry = {
  request: request({ sinceDay: "2026-09-25", day: "2026-09-30" }),
  fetchedAt: "2026-09-29T03:00:00.000Z",
  page: { resultCount: 0, results: [] },
};

describe("cache entry", () => {
  it("expires at the TTL boundary", () => {
    const fetched = Date.parse(entry.fetchedAt);
    expect(isFresh(entry, fetched + 59_999, 60_000)).toBe(true);
    expect(isFresh(entry, fetched + 60_000, 60_000)).toBe(false);
    expect(isFresh(entry, fetched - 1, 60_000)).toBe(false);
  });

  it("matches a request its stored day range covers", () => {
    expect(matchesRequest(entry, request({ sinceDay: "2026-09-28" }))).toBe(true);
    expect(matchesRequest(entry, request({ sinceDay: "2026-09-24" }))).toBe(false);
    expect(matchesRequest(entry, request({ day: "2026-10-01" }))).toBe(false);
  });

  it("rejects a different search call", () => {
    expect(matchesRequest(entry, request({ provider: "https://search.example/other" }))).toBe(
      false,
    );
    expect(matchesRequest(entry, request({ query: "other" }))).toBe(false);
    expect(matchesRequest(entry, request({ count: 2 }))).toBe(false);
    expect(matchesRequest(entry, request({ sourcePolicy: "official" }))).toBe(false);
    expect(
      matchesRequest(
        entry,
        request({
          window: { since: "2026-09-25T00:00:00.000Z", until: "2026-09-30T00:00:00.000Z" },
        }),
      ),
    ).toBe(false);
  });
});

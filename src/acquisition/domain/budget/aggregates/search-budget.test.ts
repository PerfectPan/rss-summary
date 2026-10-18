import { describe, expect, it } from "vite-plus/test";

import { isCacheablePage } from "../adapters/provider.js";
import type { CacheEntry } from "../entities/cache-entry.js";
import {
  cacheKeyMaterial,
  type BudgetLimits,
  type BudgetState,
  type CacheRequest,
  type PresentCache,
} from "../index.js";
import { usageFor } from "../services/budget-state.js";
import { SearchBudget } from "./search-budget.js";

const hash = (material: string) => material;
const normalize = (provider: string) => provider;
const limits: BudgetLimits = {
  dailyLimit: 1,
  monthlyLimit: 2,
  timezoneOffset: "+08:00",
  cacheTtlMs: 60_000,
};
const instant = new Date("2026-09-29T03:00:00.000Z");
const present: PresentCache = (entry, usage) => ({
  ...entry.page,
  results: entry.page.results.map((result) => ({ ...result })),
  searchUsage: { ...usage, source: "cache", fetchedAt: entry.fetchedAt },
});

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

describe("SearchBudget", () => {
  it("rejects an exhausted allowance and leaves the state unchanged", () => {
    const budget = SearchBudget.empty({ ...limits, dailyLimit: 0, monthlyLimit: 0 });
    const denied = budget.reserve(request(), instant, true, present);
    expect(denied._tag).toBe("Err");
    if (denied._tag !== "Err") return;
    expect(denied.error).toMatchObject({
      _tag: "SearchFailure",
      code: "local_budget_exhausted",
      message: "Local search budget exhausted (daily 0/0, monthly 0/0).",
    });
    expect(budget.persisted.daily).toEqual({});
  });

  it("keeps a reservation after it is taken and resets the monthly total in the next month", () => {
    const state = SearchBudget.empty({ ...limits, dailyLimit: 10, monthlyLimit: 2 });
    const first = state.reserve(request(), instant, true, present);
    expect(first._tag).toBe("Ok");
    if (first._tag !== "Ok") return;
    expect(first.value.events).toEqual([
      { _tag: "Reserved", day: "2026-09-29", dailyUsed: 1, monthlyUsed: 1 },
    ]);
    const nextDay = new Date("2026-09-30T03:00:00.000Z");
    const second = first.value.state.reserve(
      request({ day: "2026-09-30" }),
      nextDay,
      true,
      present,
    );
    expect(second._tag).toBe("Ok");
    if (second._tag !== "Ok") return;
    expect(second.value.value.usage).toMatchObject({ dailyUsed: 1, monthlyUsed: 2 });
    const blocked = second.value.state.reserve(
      request({ day: "2026-09-30" }),
      nextDay,
      true,
      present,
    );
    expect(blocked._tag).toBe("Err");
    if (blocked._tag !== "Err") return;
    expect(blocked.error.message).toBe("Local search budget exhausted (daily 1/10, monthly 2/2).");
    expect(second.value.state.usage(new Date("2026-10-01T03:00:00.000Z"))).toMatchObject({
      dailyUsed: 0,
      monthlyUsed: 0,
    });
  });

  it("finds a covering cache entry through the root and misses outside its day range", () => {
    const entry: CacheEntry = {
      request: request({ sinceDay: "2026-09-25", day: "2026-09-30" }),
      fetchedAt: "2026-09-29T03:00:00.000Z",
      page: { resultCount: 0, results: [] },
    };
    const restored = SearchBudget.restore(
      {
        version: 1,
        timezoneOffset: "+08:00",
        daily: {},
        cache: { [hash(cacheKeyMaterial(entry.request))]: entry },
      },
      limits,
      { hash, normalize },
    );
    expect(restored._tag).toBe("Ok");
    if (restored._tag !== "Ok") return;
    const fetched = Date.parse(entry.fetchedAt);
    expect(restored.value.state.findCache(request({ sinceDay: "2026-09-28" }), fetched)).toBe(
      entry,
    );
    expect(
      restored.value.state.findCache(request({ sinceDay: "2026-09-24" }), fetched),
    ).toBeUndefined();
    expect(restored.value.state.findCache(request({ day: "2026-10-01" }), fetched)).toBeUndefined();
  });

  it("returns the same state on a cache hit even when the allowance is exhausted", () => {
    const cachedRequest = request({ sinceDay: "2026-09-25", day: "2026-09-30" });
    const key = hash(cacheKeyMaterial(cachedRequest));
    const restored = SearchBudget.restore(
      {
        version: 1,
        timezoneOffset: "+08:00",
        daily: { "2026-09-29": 1 },
        cache: {
          [key]: {
            request: cachedRequest,
            fetchedAt: "2026-09-29T03:00:00.000Z",
            page: {
              resultCount: 1,
              results: [{ id: "a", title: "A", url: "https://e.com", rankPosition: 1 }],
            },
          },
        },
      },
      limits,
      { hash, normalize },
    );
    expect(restored._tag).toBe("Ok");
    if (restored._tag !== "Ok") return;
    const hit = restored.value.state.reserve(
      request({ sinceDay: "2026-09-28", day: "2026-09-29" }),
      instant,
      true,
      present,
    );
    expect(hit._tag).toBe("Ok");
    if (hit._tag !== "Ok") return;
    expect(hit.value.state).toBe(restored.value.state);
    expect(hit.value.events).toEqual([{ _tag: "CacheHit", fetchedAt: "2026-09-29T03:00:00.000Z" }]);
    expect(hit.value.value.cached?.results[0]?.title).toBe("A");
    expect(hit.value.value.usage).toMatchObject({ dailyUsed: 1, monthlyUsed: 1 });
  });

  it("rejects a state file whose timezone differs from the configured timezone", () => {
    const restored = SearchBudget.restore(
      { version: 1, timezoneOffset: "-08:00", daily: {}, cache: {} },
      limits,
      { hash, normalize },
    );
    expect(restored._tag).toBe("Err");
    if (restored._tag !== "Err") return;
    expect(restored.error).toMatchObject({
      code: "local_budget_state",
      message: "Local search budget timezone differs from the configured timezone.",
    });
  });

  it("rejects an invalid cache entry and an invalid monthly total", () => {
    const restored = SearchBudget.restore(
      {
        version: 1,
        timezoneOffset: "+08:00",
        daily: {},
        cache: {
          wrong: {
            request: request(),
            fetchedAt: "2026-09-29T03:00:00.000Z",
            page: { resultCount: 0, results: [] },
          },
        },
      },
      limits,
      { hash, normalize },
    );
    expect(restored._tag).toBe("Err");
    if (restored._tag !== "Err") return;
    expect(restored.error.message).toBe("Invalid local search cache entry.");

    const overflow: BudgetState = {
      version: 1,
      timezoneOffset: "+08:00",
      daily: {
        "2026-09-01": Number.MAX_SAFE_INTEGER,
        "2026-09-02": Number.MAX_SAFE_INTEGER,
      },
      cache: {},
    };
    expect(() => usageFor(overflow, instant, limits)).toThrow(
      "Local search budget contains an invalid monthly total.",
    );
  });

  it("does not spend a probe and does not store an uncacheable page", () => {
    const budget = SearchBudget.empty({ ...limits, dailyLimit: 2 });
    const probed = budget.reserve(request(), instant, false, present);
    expect(probed._tag).toBe("Ok");
    if (probed._tag !== "Ok") return;
    expect(probed.value.state).toBe(budget);
    expect(probed.value.events).toEqual([]);
    expect(probed.value.value.usage.dailyUsed).toBe(0);

    const remembered = budget.remember(
      request(),
      { provider: "glm", resultCount: 0, results: [] },
      instant.toISOString(),
      hash,
      isCacheablePage,
    );
    expect(remembered._tag).toBe("Ok");
    if (remembered._tag !== "Ok") return;
    expect(remembered.value.state).toBe(budget);
    expect(remembered.value.events).toEqual([]);
  });
});

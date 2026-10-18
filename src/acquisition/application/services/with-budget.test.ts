import { Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";

import { withBudget, type BudgetDriver } from "./with-budget.js";
import { isCacheablePage, normalizeProvider } from "../../domain/budget/adapters/provider.js";
import { SearchBudget, type BudgetLimits, type CachedPage } from "../../domain/budget/index.js";
import { NewsSearchError, type SearchInput, type SearchPage } from "../../domain/search/index.js";

const input: SearchInput = {
  query: "release",
  count: 1,
  day: "2026-09-29",
  sourcePolicy: "news",
};
const page: SearchPage = {
  resultCount: 1,
  results: [{ id: "1", title: "Release", url: "https://example.com/release", rankPosition: 1 }],
};

function driver(
  dailyLimit = 2,
  cacheTtlMs = 60_000,
): BudgetDriver & { budget: () => SearchBudget } {
  const limits: BudgetLimits = {
    dailyLimit,
    monthlyLimit: 4,
    timezoneOffset: "+08:00",
    cacheTtlMs,
  };
  const hash = (material: string) => material;
  let current = SearchBudget.empty(limits);
  return {
    stateFile: "memory.json",
    limits,
    provider: "https://search.example/web",
    now: () => new Date("2026-09-29T03:00:00.000Z"),
    hash,
    normalize: normalizeProvider,
    isCacheable: isCacheablePage,
    decodePage: (value) =>
      ({
        resultCount: value.resultCount,
        results: value.results.map((result) => ({ ...result })),
      }) as CachedPage,
    load: () => Effect.succeed(current),
    save: (state) =>
      Effect.sync(() => {
        const restored = SearchBudget.restore(state, limits, {
          hash,
          normalize: normalizeProvider,
        });
        if (restored._tag === "Err") throw restored.error;
        current = restored.value.state;
      }),
    withLock: (effect) => effect,
    budget: () => current,
  };
}

describe("withBudget", () => {
  it("shares one in-flight page and does not reserve a second attempt", async () => {
    let resolve!: (value: SearchPage) => void;
    let calls = 0;
    const search = withBudget(() => {
      calls += 1;
      return new Promise<SearchPage>((settle) => {
        resolve = settle;
      });
    }, driver(1));
    const pending = Effect.runPromise(
      Effect.all([search(input), search(input)], { concurrency: "unbounded" }),
    );
    await vi.waitFor(() => expect(calls).toBe(1));
    resolve(page);
    const [left, right] = await pending;
    expect(left).toBe(right);
    expect(left.searchUsage.dailyUsed).toBe(1);
  });

  it("keeps a failed attempt and serves a later cache hit without calling the provider again", async () => {
    const options = driver(2);
    let calls = 0;
    const search = withBudget(async () => {
      calls += 1;
      if (calls === 1) throw new NewsSearchError("http_429", "rate limit");
      return page;
    }, options);
    await expect(Effect.runPromise(search(input))).rejects.toMatchObject({ code: "http_429" });
    const stored = await Effect.runPromise(search(input));
    expect(stored.searchUsage).toMatchObject({
      source: "network",
      fetchedAt: "2026-09-29T03:00:00.000Z",
      dailyUsed: 2,
    });
    const cached = await Effect.runPromise(search(input));
    expect(cached.searchUsage.source).toBe("cache");
    expect(cached.results[0]?.title).toBe("Release");
    expect(calls).toBe(2);
    expect(options.budget().persisted.daily).toEqual({ "2026-09-29": 2 });
  });

  it("probes a cache without creating a reservation or calling the provider", async () => {
    const options = driver(1);
    let calls = 0;
    const search = withBudget(async () => {
      calls += 1;
      return page;
    }, options);
    expect(await Effect.runPromise(search.cachedSearch(input))).toBeUndefined();
    expect(calls).toBe(0);
    expect(options.budget().persisted.daily).toEqual({});
    await Effect.runPromise(search(input));
    expect((await Effect.runPromise(search.cachedSearch(input)))?.searchUsage.source).toBe("cache");
    expect(calls).toBe(1);
  });

  it("throws an invalid window before reserving", () => {
    const search = withBudget(async () => page, driver());
    expect(() =>
      search({
        ...input,
        window: { since: "2026-09-29T04:00:00Z", until: "2026-09-29T04:00:00Z" },
      }),
    ).toThrow("Invalid search time window.");
  });
});

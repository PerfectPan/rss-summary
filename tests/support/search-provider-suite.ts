import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  withBudget,
  type BudgetDriver,
} from "../../src/acquisition/application/services/with-budget.js";
import { searchWithRetry } from "../../src/acquisition/application/services/with-retry.js";
import {
  isCacheablePage,
  normalizeProvider,
  presentCachedPage,
} from "../../src/acquisition/domain/budget/adapters/provider.js";
import {
  SearchBudget,
  type BudgetLimits,
  type BudgetState,
  type CachedPage,
} from "../../src/acquisition/domain/budget/search-budget.js";
import {
  NewsSearchError,
  type SearchInput,
  type SearchPage,
} from "../../src/acquisition/domain/search/search.js";

/**
 * One contract for every SearchProvider.
 * Doubao emits `http_429` from its own transport. Grok and GLM do not: their
 * retry case injects `NewsSearchError("http_429")` around the real client.
 */
export type ProviderStep = "ok" | "http_429" | "permanent";

export type ProviderHandle = {
  search: (input: SearchInput) => Effect.Effect<SearchPage, Error>;
  invocations: () => number;
};

const input: SearchInput = {
  query: "suite",
  count: 1,
  day: "2026-08-16",
  sourcePolicy: "news",
};

export function describeSearchProvider(options: {
  name: string;
  emitsRateLimit: boolean;
  create: (next: () => ProviderStep) => ProviderHandle | Promise<ProviderHandle>;
}): void {
  describe(`${options.name} search provider`, () => {
    it("returns a search page", async () => {
      const handle = await Promise.resolve(options.create(() => "ok"));
      const page = await Effect.runPromise(handle.search(input));
      expect(typeof page.resultCount).toBe("number");
      expect(Array.isArray(page.results)).toBe(true);
      expect(handle.invocations()).toBe(1);
    });

    it("does not retry a permanent failure", async () => {
      const handle = await Promise.resolve(options.create(() => "permanent"));
      const delays: number[] = [];
      await expect(
        Effect.runPromise(
          searchWithRetry(input, (value) => Effect.runPromise(handle.search(value)), {
            random: () => 0,
            sleep: async (milliseconds) => {
              delays.push(milliseconds);
            },
          }),
        ),
      ).rejects.toBeTruthy();
      expect(handle.invocations()).toBe(1);
      expect(delays).toEqual([]);
    });

    it("retries rate limits on the historical 125ms then 250ms backoff", async () => {
      const delays: number[] = [];
      const search = await rateLimitedSearch(options);
      const page = await Effect.runPromise(
        searchWithRetry(input, search, {
          random: () => 0,
          sleep: async (milliseconds) => {
            delays.push(milliseconds);
          },
        }),
      );
      expect(delays).toEqual([125, 250]);
      expect(Array.isArray(page.results)).toBe(true);
    });

    it("budgets a successful search and caches only a cacheable page", async () => {
      const handle = await Promise.resolve(options.create(() => "ok"));
      const budgeted = withBudget(
        (value) => Effect.runPromise(handle.search(value)),
        memoryDriver(10),
      );
      const first = await Effect.runPromise(budgeted(input));
      const second = await Effect.runPromise(budgeted(input));
      expect(first.searchUsage).toMatchObject({ source: "network", dailyUsed: 1, monthlyUsed: 1 });
      const cacheable =
        first.provider === undefined || first.provider === "doubao" || first.provider === "grok";
      if (cacheable) {
        expect(second.searchUsage.source).toBe("cache");
        expect(handle.invocations()).toBe(1);
      } else {
        expect(second.searchUsage.source).toBe("network");
        expect(second.searchUsage.dailyUsed).toBe(2);
        expect(handle.invocations()).toBe(2);
      }
    });

    it("reserves again for every rate-limit retry, then returns the provider page", async () => {
      const delays: number[] = [];
      const search = await rateLimitedSearch(options);
      const budgeted = withBudget(search, memoryDriver(10));
      const page = await Effect.runPromise(
        searchWithRetry(input, (value) => Effect.runPromise(budgeted(value)), {
          random: () => 0,
          sleep: async (milliseconds) => {
            delays.push(milliseconds);
          },
        }),
      );
      expect(delays).toEqual([125, 250]);
      expect(page).toMatchObject({
        searchUsage: { source: "network", dailyUsed: 3, monthlyUsed: 3 },
      });
    });
  });
}

async function rateLimitedSearch(options: {
  emitsRateLimit: boolean;
  create: (next: () => ProviderStep) => ProviderHandle | Promise<ProviderHandle>;
}): Promise<(input: SearchInput) => Promise<SearchPage>> {
  if (options.emitsRateLimit) {
    const steps: ProviderStep[] = ["http_429", "http_429", "ok"];
    let index = 0;
    const handle = await Promise.resolve(options.create(() => steps[index++] ?? "ok"));
    return (value) => Effect.runPromise(handle.search(value));
  }
  const handle = await Promise.resolve(options.create(() => "ok"));
  let injected = 0;
  return async (value) => {
    if (injected < 2) {
      injected += 1;
      throw new NewsSearchError("http_429", "injected");
    }
    return Effect.runPromise(handle.search(value));
  };
}

function memoryDriver(dailyLimit: number): BudgetDriver {
  const limits: BudgetLimits = {
    dailyLimit,
    monthlyLimit: dailyLimit,
    timezoneOffset: "+08:00",
    cacheTtlMs: 60_000,
  };
  const hash = (material: string) => material;
  let budget = SearchBudget.empty(limits);
  return {
    stateFile: "memory.json",
    limits,
    provider: "https://suite.example/search",
    now: () => new Date("2026-08-16T04:00:00.000Z"),
    hash,
    normalize: normalizeProvider,
    isCacheable: isCacheablePage,
    presentCache: presentCachedPage,
    decodePage: (page) =>
      ({
        ...(page.provider === "doubao" || page.provider === "grok"
          ? { provider: page.provider }
          : {}),
        ...(page.logId === undefined ? {} : { logId: page.logId }),
        resultCount: page.resultCount,
        ...(page.timeCostMs === undefined ? {} : { timeCostMs: page.timeCostMs }),
        results: page.results.map((result) => ({ ...result })),
      }) as CachedPage,
    load: () => Effect.succeed(budget),
    save: (state) =>
      Effect.sync(() => {
        budget = restore(state, limits, hash);
      }),
    withLock: (effect) => effect,
  };
}

function restore(state: BudgetState, limits: BudgetLimits, hash: (material: string) => string) {
  const restored = SearchBudget.restore(state, limits, {
    hash,
    normalize: normalizeProvider,
  });
  if (restored._tag === "Err") throw restored.error;
  return restored.value.state;
}

import { expect, it } from "vite-plus/test";

import { cacheablePage, presentCachedPage } from "./cached-page.js";
import type { CacheEntry } from "../entities/cache-entry.js";
import type { BudgetUsage } from "../index.js";

const usage: BudgetUsage = {
  dailyUsed: 1,
  monthlyUsed: 1,
  dailyLimit: 4,
  monthlyLimit: 120,
};

it("caches only structurally cacheable pages, and a provider can opt out entirely", () => {
  const result = { id: "1", title: "T", url: "https://example.com", rankPosition: 1 };
  expect(cacheablePage({ resultCount: 1, results: [result] })).toBe(true);
  expect(cacheablePage({ provider: "doubao", resultCount: 1, results: [result] })).toBe(true);
  expect(cacheablePage({ provider: "grok", resultCount: 1, results: [result] })).toBe(true);
  expect(
    cacheablePage({
      provider: "doubao",
      resultCount: 1,
      results: [result],
      fallback: { reason: "empty", searched: true, reads: 0, warnings: [] },
    }),
  ).toBe(false);
  expect(
    cacheablePage({
      resultCount: 1,
      results: [
        {
          ...result,
          sourceVerification: {
            method: "configured-domain",
            domain: "example.com",
            policy: "official",
          },
        },
      ],
    }),
  ).toBe(false);

  // A provider whose pages must never be cached (a composed or unverified
  // source) declares that capability at the wiring; the budget composes it
  // with the structural rule instead of naming providers.
  const providerCacheable =
    (cacheable: boolean) =>
    (page: Parameters<typeof cacheablePage>[0]): boolean =>
      cacheable && cacheablePage(page);
  const glmPage = { provider: "glm", resultCount: 1, results: [result] };
  expect(providerCacheable(false)(glmPage)).toBe(false);
  expect(providerCacheable(true)(glmPage)).toBe(true);
});

it("clones a cached native-search receipt", () => {
  const nativeTools = ["x_keyword_search"];
  const entry = {
    request: {
      provider: "grok://cli/v1/default",
      query: "q",
      count: 1,
      day: "2026-08-16",
      sinceDay: "2026-08-16",
      sourcePolicy: "news" as const,
    },
    fetchedAt: "2026-08-16T04:00:00.000Z",
    page: {
      provider: "grok" as const,
      resultCount: 0,
      results: [],
      grok: { nativeTools, rejectedResults: 0 },
    },
  } as CacheEntry;
  const page = presentCachedPage(entry, usage) as ReturnType<typeof presentCachedPage> & {
    grok?: { nativeTools: string[] };
  };
  page.grok?.nativeTools.push("x_thread_fetch");
  expect(nativeTools).toEqual(["x_keyword_search"]);
  expect(page.searchUsage).toEqual({
    ...usage,
    source: "cache",
    fetchedAt: "2026-08-16T04:00:00.000Z",
  });
});

import { expect, it } from "vite-plus/test";

import { isCacheablePage, normalizeProvider, presentCachedPage } from "./provider.js";
import type { CacheEntry, BudgetUsage } from "../index.js";

const usage: BudgetUsage = {
  dailyUsed: 1,
  monthlyUsed: 1,
  dailyLimit: 4,
  monthlyLimit: 120,
};

it("keeps a CLI identity and strips HTTP credentials, queries and trailing slashes", () => {
  expect(normalizeProvider("grok://cli/v1/default")).toBe("grok://cli/v1/default");
  expect(
    normalizeProvider("https://user:secret-key@search.example.com/web_search/?key=secret-key"),
  ).toBe("https://search.example.com/web_search");
  expect(() => normalizeProvider("ftp://search.example.com/web")).toThrow(
    "News search provider must be an HTTP URL or a Grok CLI identity.",
  );
});

it("caches only provider pages that have no fallback and no source verification", () => {
  const result = { id: "1", title: "T", url: "https://example.com", rankPosition: 1 };
  expect(isCacheablePage({ resultCount: 1, results: [result] })).toBe(true);
  expect(isCacheablePage({ provider: "doubao", resultCount: 1, results: [result] })).toBe(true);
  expect(isCacheablePage({ provider: "grok", resultCount: 1, results: [result] })).toBe(true);
  expect(isCacheablePage({ provider: "glm", resultCount: 1, results: [result] })).toBe(false);
  expect(isCacheablePage({ provider: "mixed", resultCount: 1, results: [result] })).toBe(false);
  expect(
    isCacheablePage({
      provider: "doubao",
      resultCount: 1,
      results: [result],
      fallback: { reason: "empty", searched: true, reads: 0, warnings: [] },
    }),
  ).toBe(false);
  expect(
    isCacheablePage({
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
  const page = presentCachedPage(entry, usage);
  page.grok?.nativeTools.push("x_thread_fetch");
  expect(nativeTools).toEqual(["x_keyword_search"]);
  expect(page.searchUsage).toEqual({
    ...usage,
    source: "cache",
    fetchedAt: "2026-08-16T04:00:00.000Z",
  });
});

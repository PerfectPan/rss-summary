import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { presentCachedPage } from "../../domain/budget/adapters/provider.js";
import { cacheKey, type BudgetLimits, type CacheRequest } from "../../domain/budget/index.js";
import { loadSearchBudget, saveSearchBudget, sha256 } from "./search-budget-file.js";

const fixtureUrl = new URL("../../../../tests/fixtures/state/news-search.json", import.meta.url);
const cacheId = "8f8220deaa9e8fa4a3c7e58360123b078a6df6237c8d2e981279d11d4bdc4f2b";
const limits: BudgetLimits = {
  dailyLimit: 14,
  monthlyLimit: 420,
  timezoneOffset: "+08:00",
  cacheTtlMs: 360 * 60_000,
};
const request: CacheRequest = {
  provider: "https://open.feedcoopapi.com/search_api/web_search",
  query: "OpenAI 正式发布新模型",
  count: 10,
  day: "2026-08-16",
  sinceDay: "2026-08-16",
  sourcePolicy: "news",
};
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("search budget file", () => {
  it("round-trips the fixture bytes and serves that query from cache", async () => {
    const original = await readFile(fixtureUrl);
    expect(original.subarray(-1)).toEqual(Buffer.from("\n"));
    expect(cacheKey(request, sha256)).toBe(cacheId);

    const directory = await mkdtemp(join(tmpdir(), "news-search-roundtrip-"));
    directories.push(directory);
    const path = join(directory, "news-search.json");
    await writeFile(path, original);

    const budget = await Effect.runPromise(loadSearchBudget(path, limits));
    const hit = budget.findCache(request, Date.parse("2026-08-16T04:00:00.000Z"));
    expect(hit?.page.logId).toBe("log-golden");
    const reserved = budget.reserve(
      request,
      new Date("2026-08-16T04:00:00.000Z"),
      true,
      presentCachedPage,
    );
    expect(reserved._tag).toBe("Ok");
    if (reserved._tag !== "Ok") return;
    expect(reserved.value.events).toEqual([
      { _tag: "CacheHit", fetchedAt: "2026-08-16T04:00:00.000Z" },
    ]);
    expect(await readFile(path)).toEqual(original);

    await Effect.runPromise(saveSearchBudget(path, budget.persisted));
    expect(await readFile(path)).toEqual(original);
  });

  it("preserves a corrupt state file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "news-search-corrupt-"));
    directories.push(directory);
    const path = join(directory, "news-search.json");
    await writeFile(path, "not json");
    await expect(Effect.runPromise(loadSearchBudget(path, limits))).rejects.toMatchObject({
      code: "local_budget_state",
      message: "Local search budget state is invalid; preserve it for recovery.",
    });
    expect(await readFile(path, "utf8")).toBe("not json");
  });
});

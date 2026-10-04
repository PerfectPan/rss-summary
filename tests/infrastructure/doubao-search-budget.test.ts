import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createBudgetedDoubaoSearch } from "../../src/infrastructure/doubao-search-budget.js";
import {
  DoubaoSearchError,
  type DoubaoSearchInput,
  type DoubaoSearchPage,
} from "../../src/infrastructure/doubao-search.js";

const executeFile = promisify(execFile);
const directories: string[] = [];
const input: DoubaoSearchInput = {
  query: "TypeScript release",
  count: 5,
  day: "2026-09-29",
  sourcePolicy: "official",
};
const page: DoubaoSearchPage = {
  resultCount: 1,
  logId: "raw-log",
  results: [
    { id: "release", title: "Release", url: "https://example.com/release", rankPosition: 1 },
  ],
};
type Options = Parameters<typeof createBudgetedDoubaoSearch>[0];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function setup(overrides: Partial<Options> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "doubao-budget-"));
  directories.push(directory);
  let instant = new Date("2026-09-29T03:00:00.000Z");
  const providerSearch = vi.fn(async (): Promise<DoubaoSearchPage> => structuredClone(page));
  const options: Options = {
    stateFile: join(directory, "private", "budget.json"),
    dailyLimit: 10,
    monthlyLimit: 20,
    timezoneOffset: "+08:00",
    cacheTtlMs: 0,
    provider: "https://search.example.com/web_search",
    search: providerSearch,
    now: () => instant,
    ...overrides,
  };
  return {
    options,
    providerSearch,
    search: createBudgetedDoubaoSearch(options),
    setNow: (value: string) => (instant = new Date(value)),
  };
}

describe("persistent Doubao search budget", () => {
  it("persists every reserved attempt and applies the allowance after recreating an instance", async () => {
    const { options, search, providerSearch } = await setup({ dailyLimit: 2 });
    expect((await search(input)).searchUsage).toEqual({
      source: "network",
      fetchedAt: "2026-09-29T03:00:00.000Z",
      dailyUsed: 1,
      monthlyUsed: 1,
      dailyLimit: 2,
      monthlyLimit: 20,
    });
    const rebuilt = createBudgetedDoubaoSearch(options);
    expect((await rebuilt(input)).searchUsage.dailyUsed).toBe(2);
    await expect(rebuilt(input)).rejects.toMatchObject({ code: "local_budget_exhausted" });
    expect(providerSearch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(await readFile(options.stateFile, "utf8")).daily).toEqual({
      "2026-09-29": 2,
    });
  });

  it("allows only one of two independent instances to reserve the final slot", async () => {
    const { options, search, providerSearch } = await setup({ dailyLimit: 1 });
    const other = createBudgetedDoubaoSearch(options);
    const settled = await Promise.allSettled([
      search(input),
      other({ ...input, query: "Other release" }),
    ]);
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toMatchObject([
      { reason: { code: "local_budget_exhausted" } },
    ]);
    expect(providerSearch).toHaveBeenCalledTimes(1);
  });

  it("serializes reservations from separate processes sharing the same state file", async () => {
    const { options } = await setup({ dailyLimit: 1 });
    const moduleUrl = new URL("../../src/infrastructure/doubao-search-budget.ts", import.meta.url)
      .href;
    const script = `
      import { createBudgetedDoubaoSearch } from ${JSON.stringify(moduleUrl)};
      const options = ${JSON.stringify({ ...options, now: undefined, search: undefined })};
      const search = createBudgetedDoubaoSearch({
        ...options,
        now: () => new Date("2026-09-29T03:00:00.000Z"),
        search: async () => ({ resultCount: 0, results: [] }),
      });
      try {
        await search(${JSON.stringify(input)});
        process.stdout.write("network");
      } catch (error) {
        process.stdout.write(error.code);
      }
    `;
    const results = await Promise.all(
      [1, 2].map(() =>
        executeFile(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script]),
      ),
    );
    expect(results.map((result) => result.stdout).sort()).toEqual([
      "local_budget_exhausted",
      "network",
    ]);
    expect(JSON.parse(await readFile(options.stateFile, "utf8")).daily).toEqual({
      "2026-09-29": 1,
    });
  });

  it("keeps failed attempts charged and reserves again for every retry", async () => {
    const { options } = await setup({ dailyLimit: 3 });
    let attempts = 0;
    const providerSearch = vi.fn(async (): Promise<DoubaoSearchPage> => {
      attempts += 1;
      if (attempts <= 2) throw new DoubaoSearchError("http_429", "rate limit");
      return page;
    });
    const search = createBudgetedDoubaoSearch({ ...options, search: providerSearch });
    await expect(search(input)).rejects.toMatchObject({ code: "http_429" });
    await expect(search(input)).rejects.toMatchObject({ code: "http_429" });
    expect((await search(input)).searchUsage.dailyUsed).toBe(3);
    await expect(search(input)).rejects.toMatchObject({ code: "local_budget_exhausted" });
    expect(providerSearch).toHaveBeenCalledTimes(3);
  });

  it("releases the reservation lock before waiting for the provider", async () => {
    const { options } = await setup();
    let complete!: (value: DoubaoSearchPage) => void;
    let started!: () => void;
    const providerStarted = new Promise<void>((resolve) => (started = resolve));
    const search = createBudgetedDoubaoSearch({
      ...options,
      search: () => {
        started();
        return new Promise<DoubaoSearchPage>((resolve) => (complete = resolve));
      },
    });
    const first = search(input);
    await providerStarted;
    await expect(access(`${options.stateFile}.lock`)).rejects.toMatchObject({ code: "ENOENT" });
    const independent = createBudgetedDoubaoSearch(options);
    expect((await independent({ ...input, query: "Second query" })).searchUsage.dailyUsed).toBe(2);
    complete(page);
    await first;
  });

  it("uses the real clock with the configured timezone and retains consumed days across rollbacks", async () => {
    const { search, setNow, options } = await setup({ dailyLimit: 1, monthlyLimit: 2 });
    setNow("2026-09-29T15:59:00.000Z");
    await search({ ...input, day: "2001-01-01" });
    setNow("2026-09-29T16:00:00.000Z");
    expect((await search({ ...input, day: "2027-01-01" })).searchUsage).toMatchObject({
      dailyUsed: 1,
      monthlyUsed: 2,
    });
    setNow("2026-09-30T16:00:00.000Z");
    expect((await search(input)).searchUsage).toMatchObject({ dailyUsed: 1, monthlyUsed: 1 });
    setNow("2026-09-29T03:00:00.000Z");
    await expect(search(input)).rejects.toMatchObject({ code: "local_budget_exhausted" });
    expect(JSON.parse(await readFile(options.stateFile, "utf8")).daily).toEqual({
      "2026-09-29": 1,
      "2026-09-30": 1,
      "2026-10-01": 1,
    });
  });

  it("enforces the monthly allowance on a fresh day and resets only in a new month", async () => {
    const { search, setNow } = await setup({ monthlyLimit: 1 });
    await search(input);
    setNow("2026-09-30T03:00:00.000Z");
    await expect(search(input)).rejects.toMatchObject({ code: "local_budget_exhausted" });
    setNow("2026-10-01T03:00:00.000Z");
    expect((await search(input)).searchUsage.monthlyUsed).toBe(1);
  });

  it("writes state and newly created directories with private permissions and no credential", async () => {
    const { options } = await setup({
      provider: "https://user:secret-key@search.example.com/web_search/?key=secret-key",
    });
    const credential = "private-provider-key";
    const search = createBudgetedDoubaoSearch({
      ...options,
      search: async () => {
        expect(credential).toBe("private-provider-key");
        return page;
      },
    });
    await search(input);
    const contents = await readFile(options.stateFile, "utf8");
    expect(contents).not.toContain("secret-key");
    expect(contents).not.toContain(credential);
    expect(contents).toContain("https://search.example.com/web_search");
    expect((await stat(options.stateFile)).mode & 0o777).toBe(0o600);
    expect((await stat(dirname(options.stateFile))).mode & 0o777).toBe(0o700);
  });

  it.each([
    "not json",
    "{}",
    JSON.stringify({
      version: 1,
      timezoneOffset: "+08:00",
      daily: { "2026-09-29": -1 },
      cache: {},
    }),
    JSON.stringify({
      version: 1,
      timezoneOffset: "+08:00",
      daily: { "invalid-date": 0 },
      cache: {},
    }),
    JSON.stringify({ version: 2, timezoneOffset: "+08:00", daily: {}, cache: {} }),
    JSON.stringify({ version: 1, timezoneOffset: "+08:00", daily: {}, cache: { invalid: {} } }),
  ])("fails closed for damaged state without overwriting it (%s)", async (contents) => {
    const { options, search, providerSearch } = await setup();
    await search(input);
    await writeFile(options.stateFile, contents);
    await expect(search(input)).rejects.toMatchObject({ code: "local_budget_state" });
    expect(providerSearch).toHaveBeenCalledTimes(1);
    expect(await readFile(options.stateFile, "utf8")).toBe(contents);
  });

  it("fails closed when the configured timezone differs from persisted counters", async () => {
    const { options, search, providerSearch } = await setup();
    await search(input);
    const changed = createBudgetedDoubaoSearch({ ...options, timezoneOffset: "-08:00" });
    await expect(changed(input)).rejects.toMatchObject({ code: "local_budget_state" });
    expect(providerSearch).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the lock cannot be acquired and preserves the existing lock", async () => {
    const { options, search, providerSearch } = await setup();
    await search(input);
    await writeFile(`${options.stateFile}.lock`, "owned by another process");
    await expect(search(input)).rejects.toMatchObject({ code: "local_budget_state" });
    expect(await readFile(`${options.stateFile}.lock`, "utf8")).toBe("owned by another process");
    expect(providerSearch).toHaveBeenCalledTimes(1);
  });
});

describe("cached search budget probe", () => {
  it("returns undefined with available budget without reserving an attempt or calling the provider", async () => {
    const { search, providerSearch, options } = await setup({ dailyLimit: 2 });
    expect(await search.cachedSearch(input)).toBeUndefined();
    expect(await search.cachedSearch(input)).toBeUndefined();
    expect(providerSearch).not.toHaveBeenCalled();
    await expect(access(options.stateFile)).rejects.toMatchObject({ code: "ENOENT" });
    await search(input);
    const before = await readFile(options.stateFile, "utf8");
    expect(await search.cachedSearch(input)).toBeUndefined();
    expect(await readFile(options.stateFile, "utf8")).toBe(before);
    expect(providerSearch).toHaveBeenCalledTimes(1);
  });

  it.each([{ dailyLimit: 1 }, { monthlyLimit: 1 }])(
    "rejects after a provider quota failure consumed the last local allowance (%j)",
    async (limit) => {
      const { options } = await setup(limit);
      const providerSearch = vi.fn(async (): Promise<DoubaoSearchPage> => {
        throw new DoubaoSearchError("10406", "provider quota exhausted");
      });
      const search = createBudgetedDoubaoSearch({ ...options, search: providerSearch });
      await expect(search(input)).rejects.toMatchObject({ code: "10406" });
      await expect(search.cachedSearch(input)).rejects.toMatchObject({
        code: "local_budget_exhausted",
      });
      expect(providerSearch).toHaveBeenCalledTimes(1);
    },
  );

  it("returns a fresh persisted cache even when both local allowances are exhausted", async () => {
    const { search, providerSearch, options, setNow } = await setup({
      dailyLimit: 1,
      monthlyLimit: 1,
      cacheTtlMs: 60_000,
    });
    await search(input);
    const before = await readFile(options.stateFile, "utf8");
    const rebuilt = createBudgetedDoubaoSearch(options);
    expect((await rebuilt.cachedSearch(input))?.searchUsage).toMatchObject({
      source: "cache",
      fetchedAt: "2026-09-29T03:00:00.000Z",
      dailyUsed: 1,
      monthlyUsed: 1,
    });
    expect(await readFile(options.stateFile, "utf8")).toBe(before);
    await expect(rebuilt.cachedSearch({ ...input, query: "Uncached query" })).rejects.toMatchObject(
      {
        code: "local_budget_exhausted",
      },
    );
    setNow("2026-09-29T03:01:00.000Z");
    await expect(rebuilt.cachedSearch(input)).rejects.toMatchObject({
      code: "local_budget_exhausted",
    });
    expect(providerSearch).toHaveBeenCalledTimes(1);
  });

  it("fails closed for corrupted state without resetting counters or contacting the provider", async () => {
    const { options, search, providerSearch } = await setup({ cacheTtlMs: 60_000 });
    await search(input);
    await writeFile(options.stateFile, "corrupted-state");
    await expect(search.cachedSearch(input)).rejects.toMatchObject({ code: "local_budget_state" });
    expect(await readFile(options.stateFile, "utf8")).toBe("corrupted-state");
    expect(providerSearch).toHaveBeenCalledTimes(1);
  });
});

describe("raw Doubao response cache", () => {
  it("reuses a persisted cache without spending budget and preserves the original fetch time", async () => {
    const { options, search, setNow, providerSearch } = await setup({
      cacheTtlMs: 60_000,
      dailyLimit: 1,
    });
    const result = await search(input);
    result.results[0]!.title = "Mutated by consumer";
    setNow("2026-09-29T03:00:30.000Z");
    const rebuilt = createBudgetedDoubaoSearch(options);
    const cached = await rebuilt({ ...input, sinceDay: input.day });
    expect(cached.results).toEqual(page.results);
    expect(cached.searchUsage).toMatchObject({
      source: "cache",
      fetchedAt: "2026-09-29T03:00:00.000Z",
      dailyUsed: 1,
      monthlyUsed: 1,
    });
    expect(providerSearch).toHaveBeenCalledTimes(1);
  });

  it("reuses a cache covering the requested dates and rejects incomplete date coverage", async () => {
    const { search, providerSearch } = await setup({ cacheTtlMs: 60_000 });
    await search({ ...input, sinceDay: "2026-09-25", day: "2026-09-30" });
    expect((await search({ ...input, sinceDay: "2026-09-28" })).searchUsage.source).toBe("cache");
    expect((await search({ ...input, sinceDay: "2026-09-24" })).searchUsage.source).toBe("network");
    expect((await search({ ...input, day: "2026-10-01" })).searchUsage.source).toBe("network");
    expect(providerSearch).toHaveBeenCalledTimes(3);
  });

  it("keeps provider, query, count and source policy in separate cache identities", async () => {
    const { options, search, providerSearch } = await setup({ cacheTtlMs: 60_000 });
    await search(input);
    const otherProvider = createBudgetedDoubaoSearch({
      ...options,
      provider: "https://other.example.com/web_search",
    });
    await otherProvider(input);
    await search({ ...input, query: "Other release" });
    await search({ ...input, count: 10 });
    await search({ ...input, sourcePolicy: "authoritative" });
    expect(providerSearch).toHaveBeenCalledTimes(5);
    expect((await search(input)).searchUsage.source).toBe("cache");
  });

  it("expires at the TTL boundary and does not accept a fetch time in the future", async () => {
    const { search, setNow, providerSearch } = await setup({ cacheTtlMs: 60_000 });
    await search(input);
    setNow("2026-09-29T03:01:00.000Z");
    expect((await search(input)).searchUsage.source).toBe("network");
    setNow("2026-09-29T03:00:59.000Z");
    expect((await search(input)).searchUsage.source).toBe("network");
    expect(providerSearch).toHaveBeenCalledTimes(3);
  });

  it("shares an in-flight request in one instance without consuming another attempt", async () => {
    const { options } = await setup({ dailyLimit: 1 });
    const providerSearch = vi.fn(async () => page);
    const search = createBudgetedDoubaoSearch({ ...options, search: providerSearch });
    const [first, second] = await Promise.all([search(input), search(input)]);
    expect(first).toBe(second);
    expect(first.searchUsage.dailyUsed).toBe(1);
    expect(providerSearch).toHaveBeenCalledTimes(1);
  });

  it.each(["glm", "mixed"] as const)("never caches %s responses", async (provider) => {
    const { options } = await setup({ cacheTtlMs: 60_000 });
    const providerSearch = vi.fn(async (): Promise<DoubaoSearchPage> => ({ ...page, provider }));
    const search = createBudgetedDoubaoSearch({ ...options, search: providerSearch });
    await search(input);
    await search(input);
    expect(providerSearch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(await readFile(options.stateFile, "utf8")).cache).toEqual({});
  });
});

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { collectXAccountPosts } from "../../../src/acquisition/infra/x-account-posts.js";
import { GrokXClient } from "../../../src/acquisition/infra/adapters/grok-cli.js";
import { createBudgetedNewsSearch } from "../../../src/acquisition/infra/budgeted-search.js";
import { NewsSearchError, type NewsSearchPage } from "../../../src/acquisition/index.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
const since = "2026-10-13T01:00:00.000Z";
const until = "2026-10-14T01:00:00.000Z";
const now = () => new Date(until);
const input = { since, until, handles: ["ClaudeDevs"] };
const page: NewsSearchPage = {
  provider: "grok",
  resultCount: 1,
  grok: { nativeTools: ["x_keyword_search"], rejectedResults: 0 },
  results: [
    {
      id: "123",
      title: "作者分享开发经验",
      summary: "一条有上下文的使用经验",
      url: "https://x.com/claudedevs/status/123",
      publishTime: since,
      rankPosition: 1,
      authInfoLevel: 4,
    },
  ],
};
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "x-accounts-test-"));
  directories.push(directory);
  const env = {
    NEWS_SEARCH_STATE_FILE: join(directory, "budget.json"),
    NEWS_SEARCH_DAILY_LIMIT: "4",
    NEWS_SEARCH_MONTHLY_LIMIT: "120",
  };
  const search = vi.fn<GrokXClient["search"]>().mockResolvedValue(page);
  return { env, search, dependencies: { env, now, client: { search } } };
}

describe("X account subscriptions", () => {
  it("collects original and quote commentary once per normalized account without news filtering", async () => {
    const { search, dependencies } = await fixture();
    const result = await Effect.runPromise(
      collectXAccountPosts({ ...input, handles: ["@ClaudeDevs", "claudedevs"] }, dependencies),
    );
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0]?.[0]).toMatchObject({ handle: "claudedevs", since, until });
    expect(search.mock.calls[0]?.[0].instruction).toContain("from:claudedevs");
    expect(search.mock.calls[0]?.[0].instruction).toContain("opinions, research and tutorials");
    expect(result.posts[0]).toMatchObject({ author: "claudedevs", title: page.results[0]!.title });
    expect(result.audit[0]).toMatchObject({
      status: "ok",
      acceptedCount: 1,
      limitReached: false,
      searchUsage: { source: "network", dailyUsed: 1 },
    });
  });

  it("reuses the same window without another charged attempt, but refreshes a later window", async () => {
    const { search, dependencies } = await fixture();
    await Effect.runPromise(collectXAccountPosts(input, dependencies));
    const replay = await Effect.runPromise(collectXAccountPosts(input, dependencies));
    expect(search).toHaveBeenCalledTimes(1);
    expect(replay.audit[0]?.searchUsage).toMatchObject({ source: "cache", dailyUsed: 1 });
    await Effect.runPromise(
      collectXAccountPosts({ ...input, until: "2026-10-14T01:01:00.000Z" }, dependencies),
    );
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("shares the news request ledger and refuses a new account when it is exhausted", async () => {
    const { env, search, dependencies } = await fixture();
    env.NEWS_SEARCH_DAILY_LIMIT = "1";
    const news = createBudgetedNewsSearch({
      search: async () => page,
      provider: "grok://cli/v1/default",
      stateFile: env.NEWS_SEARCH_STATE_FILE,
      dailyLimit: 1,
      monthlyLimit: 120,
      timezoneOffset: "+08:00",
      cacheTtlMs: 60_000,
      now,
    });
    await Effect.runPromise(
      news({ query: "AI announcements", count: 10, day: "2026-10-14", sourcePolicy: "news" }),
    );
    const result = await Effect.runPromise(collectXAccountPosts(input, dependencies));
    expect(search).not.toHaveBeenCalled();
    expect(result).toEqual({
      posts: [],
      audit: [
        {
          handle: "claudedevs",
          status: "failed",
          acceptedCount: 0,
          errorCode: "local_budget_exhausted",
        },
      ],
    });
  });

  it("records failed attempts without retries or refund and continues other accounts", async () => {
    const { env, search, dependencies } = await fixture();
    search.mockRejectedValueOnce(new NewsSearchError("grok_cli_failed", "private output"));
    const result = await Effect.runPromise(
      collectXAccountPosts({ ...input, handles: ["ClaudeDevs", "OpenAI"] }, dependencies),
    );
    expect(search).toHaveBeenCalledTimes(2);
    expect(result.audit.map(({ status }) => status)).toEqual(["failed", "ok"]);
    expect(JSON.stringify(result)).not.toContain("private output");
    expect(JSON.parse(await readFile(env.NEWS_SEARCH_STATE_FILE, "utf8")).daily["2026-10-14"]).toBe(
      2,
    );
  });

  it("reports a saturated retrieval rather than claiming a complete timeline", async () => {
    const { env, dependencies } = await fixture();
    Object.assign(env, { X_ACCOUNT_POSTS_PER_FETCH: "1" });
    const result = await Effect.runPromise(collectXAccountPosts(input, dependencies));
    expect(result.audit[0]?.limitReached).toBe(true);
  });

  it("does not require Grok configuration when disabled", async () => {
    expect(
      await Effect.runPromise(
        collectXAccountPosts(
          { ...input, handles: [] },
          { env: { NEWS_GROK_MODEL: "invalid/model" } },
        ),
      ),
    ).toEqual({ posts: [], audit: [] });
  });

  it.each([{ handles: ["ClaudeDevs OR OpenAI"] }, { since: until }, { until: "invalid" }])(
    "rejects invalid subscription input before consuming budget",
    async (change) => {
      const { env, search, dependencies } = await fixture();
      await expect(
        Effect.runPromise(collectXAccountPosts({ ...input, ...change }, dependencies)),
      ).rejects.toThrow();
      expect(search).not.toHaveBeenCalled();
      await expect(readFile(env.NEWS_SEARCH_STATE_FILE)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );
});

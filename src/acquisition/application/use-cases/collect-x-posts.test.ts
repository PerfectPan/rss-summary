import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { searchBudgetDefaults } from "../services/budget-defaults.js";
import { collectXAccountPosts, type OpenSearchBudget } from "./collect-x-posts.js";
import { NewsSearchError } from "../../domain/search/index.js";
import type { BudgetedSearch } from "../services/with-budget.js";
import type { NewsSearchPage } from "../../domain/search/index.js";

function budgetOf(run: (value: { query: string }) => Promise<NewsSearchPage>): BudgetedSearch {
  return Object.assign(
    (value: { query: string }) =>
      Effect.tryPromise({ try: () => run(value), catch: (reason) => reason }),
    { cachedSearch: () => Effect.succeed(undefined) },
  ) as BudgetedSearch;
}

const since = "2026-08-16T00:00:00.000Z";
const until = "2026-08-17T00:00:00.000Z";
const usage = {
  source: "network" as const,
  fetchedAt: since,
  dailyUsed: 1,
  monthlyUsed: 1,
  dailyLimit: 4,
  monthlyLimit: 120,
};

describe("collectXAccountPosts", () => {
  it("returns before model validation when there are no handles", async () => {
    const openBudget: OpenSearchBudget = () => {
      throw new Error("budget opened");
    };
    await expect(
      Effect.runPromise(
        collectXAccountPosts(
          { handles: [], since, until },
          { env: { NEWS_GROK_MODEL: "invalid/model" }, openBudget },
        ),
      ),
    ).resolves.toEqual({ posts: [], audit: [] });
  });

  it("dedupes handles, uses the shared allowance, and records a search failure", async () => {
    const opened: Array<Parameters<OpenSearchBudget>[0]> = [];
    const openBudget: OpenSearchBudget = (options) => {
      opened.push(options);
      return budgetOf(async () => {
        throw new NewsSearchError("grok_timeout", "timed out", {
          grok: { nativeTools: [], rejectedResults: 0 },
        });
      });
    };
    const result = await Effect.runPromise(
      collectXAccountPosts(
        { handles: ["@ClaudeDevs", "claudedevs"], since, until },
        {
          env: {},
          openBudget,
          client: { search: async () => ({ resultCount: 0, results: [] }) },
        },
      ),
    );
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({
      provider: "grok://cli/v1/default",
      stateFile: searchBudgetDefaults.stateFile,
      dailyLimit: searchBudgetDefaults.grok.dailyLimit,
      monthlyLimit: searchBudgetDefaults.grok.monthlyLimit,
      cacheTtlMs: searchBudgetDefaults.cacheTtlMinutes * 60_000,
    });
    expect(result).toEqual({
      posts: [],
      audit: [
        expect.objectContaining({
          handle: "claudedevs",
          status: "failed",
          errorCode: "grok_timeout",
          acceptedCount: 0,
        }),
      ],
    });
    const search = opened[0]?.search;
    await expect(search?.()).resolves.toEqual({ resultCount: 0, results: [] });
  });

  it("asks the client for the historical account instruction", async () => {
    let instruction = "";
    let query = "";
    const openBudget: OpenSearchBudget = (options) =>
      budgetOf(async (value: { query: string }) => {
        query = value.query;
        const page = await options.search();
        return { ...page, searchUsage: usage } as NewsSearchPage;
      });
    const result = await Effect.runPromise(
      collectXAccountPosts(
        { handles: ["ClaudeDevs"], since, until },
        {
          env: {},
          openBudget,
          client: {
            search: async (value) => {
              instruction = value.instruction;
              return {
                resultCount: 1,
                results: [
                  {
                    id: "1",
                    title: "帖子",
                    url: "https://x.com/claudedevs/status/1",
                    summary: "摘要",
                    publishTime: since,
                    rankPosition: 1,
                  },
                ],
              };
            },
          },
        },
      ),
    );
    expect(instruction).toContain("from:claudedevs");
    expect(instruction).toContain("opinions, research and tutorials");
    expect(query).toBe(`x-account:v1:claudedevs:${since}:${until}`);
    expect(result.posts).toEqual([
      {
        id: "1",
        author: "claudedevs",
        url: "https://x.com/claudedevs/status/1",
        title: "帖子",
        summary: "摘要",
        publishedAt: since,
      },
    ]);
    expect(result.audit[0]).toMatchObject({ status: "ok", acceptedCount: 1, limitReached: false });
  });

  it("rejects an invalid model and a non-search failure", async () => {
    const openBudget: OpenSearchBudget = () => {
      throw new Error("budget opened");
    };
    await expect(
      Effect.runPromise(
        collectXAccountPosts(
          { handles: ["someone"], since, until },
          { env: { NEWS_GROK_MODEL: "invalid/model" }, openBudget },
        ),
      ),
    ).rejects.toThrow("Invalid NEWS_GROK_MODEL.");
    await expect(
      Effect.runPromise(
        collectXAccountPosts(
          { handles: ["someone"], since, until },
          {
            env: { X_ACCOUNT_POSTS_PER_FETCH: "0" },
            openBudget,
            client: { search: async () => ({ resultCount: 0, results: [] }) },
          },
        ),
      ),
    ).rejects.toThrow("Numeric configuration must be an integer between 1 and 50.");
    await expect(
      Effect.runPromise(
        collectXAccountPosts(
          { handles: ["someone"], since, until },
          {
            env: {},
            openBudget: () => budgetOf(async () => Promise.reject(new Error("client exploded"))),
            client: { search: async () => ({ resultCount: 0, results: [] }) },
          },
        ),
      ),
    ).rejects.toThrow("client exploded");
  });
});

describe("X_ACCOUNT_POSTS_PER_FETCH", () => {
  it("bounds X_ACCOUNT_POSTS_PER_FETCH", async () => {
    const occurrence = "2026-08-11T01:00:00.000Z";
    await expect(
      Effect.runPromise(
        collectXAccountPosts(
          { handles: ["ClaudeDevs"], since: "2026-08-10T01:00:00Z", until: occurrence },
          {
            env: { X_ACCOUNT_POSTS_PER_FETCH: "0" },
            openBudget: () => {
              throw new Error("budget opened");
            },
            client: { search: async () => ({ resultCount: 0, results: [] }) },
          },
        ),
      ),
    ).rejects.toThrow("Numeric configuration must be an integer between 1 and 50.");
  });
});

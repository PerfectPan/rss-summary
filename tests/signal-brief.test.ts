import { describe, expect, it, vi } from "vitest";

import { generateSignalBrief } from "../src/signal-brief.js";
import { parseSignalSources } from "../src/signal-sources.js";

const config = parseSignalSources(
  JSON.stringify({
    timezoneOffsetEnv: "FEED_TIMEZONE_OFFSET",
    quotas: { maxTotal: 8, updates: 5, opensource: 4 },
    frontendBias: {
      languages: ["TypeScript", "JavaScript"],
      repoTopics: ["react", "nextjs", "mcp", "agent", "ai"],
      updateKeywords: ["coding", "agent", "IDE", "SDK", "browser", "TypeScript"],
      modelTitleHints: ["GPT", "Claude", "Gemini", "LLM", "API", "模型"],
    },
    scoring: {},
    hackerNews: { minPoints: 80, includeShowHn: true, maxItems: 20 },
    githubSearch: {
      createdWithinDays: 7,
      minStars: 50,
      languages: ["TypeScript"],
      topics: ["ai"],
      excludeNamePatterns: ["^awesome[-_]"],
      perPage: 8,
    },
    officialSearch: {
      domains: ["openai.com"],
      intents: [
        { kind: "model", query: "model release" },
        { kind: "product", query: "product launch" },
      ],
      countPerQuery: 10,
    },
  }),
);

function doubaoResult(url: string, title: string, kind: "model" | "product"): ReturnType<typeof doubaoPage> {
  return doubaoPage({
    id: `${kind}-${url}`,
    title,
    url,
    summary: `${title} official announcement`,
    siteName: "OpenAI",
    publishTime: "2026-07-29T09:00:00+08:00",
  });
}

function doubaoPage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    logId: "log-1",
    resultCount: 1,
    timeCostMs: 10,
    results: [
      {
        id: "r-1",
        title: "GPT-5 API model",
        url: "https://openai.com/blog/gpt-5",
        summary: "GPT-5 API model official announcement",
        siteName: "OpenAI",
        publishTime: "2026-07-29T09:00:00+08:00",
        ...overrides,
      },
    ],
  };
}

describe("signal brief application service", () => {
  it("fans out to official search, Hacker News, and GitHub and renders two sections", async () => {
    const doubaoSearch = vi.fn(async ({ query }: { query: string }) => {
      if (query.includes("model")) {
        return doubaoResult("https://openai.com/blog/gpt-5", "GPT-5 API model", "model");
      }
      return doubaoResult("https://vercel.com/blog/sdk", "Vercel ships a new SDK", "product");
    });
    const hackerNewsSearch = vi.fn(async () => [
      {
        id: "hn-1",
        title: "Show HN: Agent IDE",
        points: 210,
        numComments: 30,
        createdAt: "2026-07-29T08:00:00Z",
        isShowHn: true,
        author: "builder",
        url: "https://example.com/agent-ide",
      },
    ]);
    const githubSearch = vi.fn(async () => [
      {
        fullName: "acme/agent-kit",
        htmlUrl: "https://github.com/acme/agent-kit",
        description: "A TypeScript agent harness with MCP support.",
        language: "TypeScript",
        stars: 1234,
        createdAt: "2026-07-27T10:00:00+08:00",
        topics: ["agent", "mcp"],
      },
    ]);

    const result = await generateSignalBrief(
      { day: "2026-07-29" },
      { env: { FEED_TIMEZONE_OFFSET: "+08:00" }, config, doubaoSearch, hackerNewsSearch, githubSearch },
    );

    expect(doubaoSearch).toHaveBeenCalledTimes(2);
    expect(doubaoSearch).toHaveBeenCalledWith(
      expect.objectContaining({ day: "2026-07-29", sourcePolicy: "official", count: 10 }),
    );
    expect(hackerNewsSearch).toHaveBeenCalledWith({ minPoints: 80, includeShowHn: true, maxItems: 20 });
    expect(githubSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "created:>=2026-07-23 stars:>50 TypeScript OR ai",
        perPage: 8,
        sort: "stars",
      }),
    );
    expect(result).toMatchObject({
      day: "2026-07-29",
      itemCount: 4,
      sections: { updates: 3, opensource: 1 },
      warnings: [],
    });
    expect(result.markdown).toContain("# 高信号速览 · 2026-07-29");
    expect(result.markdown).toContain("**动态 · 3**");
    expect(result.markdown).toContain("**[模型] [GPT-5 API model](https://openai.com/blog/gpt-5)**");
    expect(result.markdown).toContain("**开源 · 1**");
    expect(result.markdown).toContain("**[上升] [acme/agent-kit](https://github.com/acme/agent-kit)**");
  });

  it("derives the calendar day from the occurrence in the configured timezone", async () => {
    const doubaoSearch = vi.fn(async () => doubaoPage());
    const result = await generateSignalBrief(
      { occurrence: "2026-07-29T11:00:00.000Z" },
      {
        env: { FEED_TIMEZONE_OFFSET: "+08:00" },
        config,
        doubaoSearch,
        hackerNewsSearch: async () => [],
        githubSearch: async () => [],
      },
    );

    expect(result.day).toBe("2026-07-29");
    expect(doubaoSearch).toHaveBeenCalledWith(expect.objectContaining({ day: "2026-07-29" }));
  });

  it("continues with warnings when some sources fail and fails when all fail", async () => {
    const partial = await generateSignalBrief(
      { day: "2026-07-29" },
      {
        env: { FEED_TIMEZONE_OFFSET: "+08:00" },
        config,
        doubaoSearch: async ({ query }: { query: string }) => {
          if (query.includes("model")) throw new Error("down");
          return doubaoPage();
        },
        hackerNewsSearch: async () => [],
        githubSearch: async () => [],
      },
    );

    expect(partial.warnings).toContain("官方搜索：1 个查询暂不可用");
    expect(partial.itemCount).toBe(1);
    expect(partial.markdown).toContain("**动态 · 1**");

    await expect(
      generateSignalBrief(
        { day: "2026-07-29" },
        {
          env: { FEED_TIMEZONE_OFFSET: "+08:00" },
          config,
          doubaoSearch: async () => {
            throw new Error("down");
          },
          hackerNewsSearch: async () => {
            throw new Error("down");
          },
          githubSearch: async () => {
            throw new Error("down");
          },
        },
      ),
    ).rejects.toThrow(/all.*signal/i);
  });

  it("requires day or occurrence and validates both", async () => {
    await expect(generateSignalBrief({}, { config, env: {} })).rejects.toThrow(/day or occurrence/);
    await expect(generateSignalBrief({ day: "07-29-2026" }, { config, env: {} })).rejects.toThrow(/YYYY-MM-DD/);
  });
});

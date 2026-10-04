import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  AllDoubaoQueriesFailedError,
  generateRivusNewsBrief,
  resolveNewsEditionWindow,
  type RivusNewsBriefResult,
} from "../../src/application/news-brief.js";
import type { NewsTopicQuery } from "../../src/domain/news.js";
import {
  DoubaoSearchError,
  type DoubaoSearchInput,
} from "../../src/infrastructure/doubao-search.js";
import { renderNewsBrief } from "../../src/presentation/news-render.js";

function withNewsMarkdown(result: RivusNewsBriefResult) {
  return {
    ...result,
    markdown: renderNewsBrief({
      day: result.day,
      edition: result.edition,
      generatedAt: result.generatedAt,
      stories: result.stories,
      topics: result.topics,
      warnings: result.warnings,
      windowLabel: result.windowLabel,
    }),
  };
}

describe("Rivus news brief Tool adapter", () => {
  it("rotates four of seven queries and reports deferred coverage", async () => {
    const queryIds = ["one", "two", "three", "four", "five", "six", "seven"];
    const covered = new Set<string>();
    for (const occurrence of [
      "2026-10-04T12:30:00+08:00",
      "2026-10-05T12:30:00+08:00",
      "2026-10-06T12:30:00+08:00",
    ]) {
      const search = vi.fn(async () => ({ resultCount: 0, results: [] }));
      const result = await Effect.runPromise(
        generateRivusNewsBrief(
          { edition: "noon", occurrence },
          { env: {}, search, topics: [newsTopic("technology", queryIds)] },
        ),
      );
      expect(search).toHaveBeenCalledTimes(4);
      expect(result.audit.queries.filter(({ status }) => status === "skipped")).toHaveLength(3);
      expect(result.sourceStatus?.state).toBe("partial");
      expect(result.warnings.join(" ")).toContain("4/7");
      for (const query of result.audit.queries)
        if (query.status === "ok") covered.add(query.queryId);
    }
    expect([...covered].sort()).toEqual([...queryIds].sort());
  });

  it.each(["2026-10-04T00:00:00+08:00", "2026-10-04T16:00:00+08:00"])(
    "uses the complete explicit window at %s regardless of edition cutoff",
    async (occurrence) => {
      const until = Date.parse(occurrence);
      const search = vi.fn(async () => ({
        resultCount: 2,
        results: [
          {
            id: "inside",
            title: "TypeScript release",
            url: "https://example.com/inside",
            publishTime: new Date(until - 60_000).toISOString(),
            authInfoLevel: 1,
            rankPosition: 1,
          },
          {
            id: "boundary",
            title: "TypeScript release at boundary",
            url: "https://example.com/boundary",
            publishTime: occurrence,
            authInfoLevel: 1,
            rankPosition: 2,
          },
        ],
      }));
      const result = await Effect.runPromise(
        generateRivusNewsBrief(
          { occurrence, edition: "noon", since: new Date(until - 86_400_000).toISOString() },
          {
            env: {},
            search,
            topics: [
              {
                ...newsTopic("technology", []),
                queries: [
                  newsQuery("typescript", "TypeScript release", ["TypeScript"], ["release"]),
                ],
              },
            ],
          },
        ),
      );
      expect(result.stories.map(({ canonicalUrl }) => canonicalUrl)).toEqual([
        "https://example.com/inside",
      ]);
      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({ sinceDay: "2026-10-03", day: "2026-10-04" }),
      );
    },
  );

  it("counts HTTP retries across invocations and explains a local cap without GLM fallback", async () => {
    const directory = await mkdtemp(join(tmpdir(), "news-budget-integration-"));
    const stateFile = join(directory, "budget.json");
    const fetch = vi.fn(async () => new Response("rate limit", { status: 429 }));
    const glm = {
      search: vi.fn(async () => []),
      read: vi.fn(async () => {
        throw new Error("unused");
      }),
    };
    vi.stubGlobal("fetch", fetch);
    try {
      const dependencies = {
        env: {
          DOUBAO_SEARCH_API_KEY: "test",
          NEWS_SEARCH_STATE_FILE: stateFile,
          NEWS_SEARCH_DAILY_LIMIT: "2",
          NEWS_SEARCH_MODE: "hybrid",
        },
        now: () => new Date("2026-10-04T12:30:00+08:00"),
        sleep: async () => undefined,
        glm,
        topics: [newsTopic("technology", ["one"])],
      };
      const input = { edition: "noon", occurrence: "2026-10-04T12:30:00+08:00" };
      const first = await Effect.runPromise(generateRivusNewsBrief(input, dependencies));
      const next = await Effect.runPromise(generateRivusNewsBrief(input, dependencies));
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(glm.search).not.toHaveBeenCalled();
      expect(glm.read).not.toHaveBeenCalled();
      for (const result of [first, next]) {
        expect(result.sourceStatus?.state).toBe("unavailable");
        expect(result.audit.queries[0]).toMatchObject({
          status: "skipped",
          errorCode: "local_budget_exhausted",
        });
        expect(result.warnings.join(" ")).toContain("预算已用完");
      }
      expect(await readFile(stateFile, "utf8")).not.toContain("test");
    } finally {
      vi.unstubAllGlobals();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves cache timestamps and discloses that later updates were not searched", async () => {
    const searchUsage = {
      source: "cache" as const,
      fetchedAt: "2026-10-04T01:10:00Z",
      dailyUsed: 6,
      monthlyUsed: 56,
      dailyLimit: 14,
      monthlyLimit: 420,
    };
    const result = await Effect.runPromise(
      generateRivusNewsBrief(
        { edition: "noon", occurrence: "2026-10-04T12:30:00+08:00" },
        {
          env: {},
          topics: [newsTopic("technology", ["one"])],
          search: async () => ({ results: [], resultCount: 0, searchUsage }),
        },
      ),
    );
    expect(result.audit.queries[0]?.searchUsage).toEqual(searchUsage);
    expect(result.sourceStatus?.state).toBe("partial");
    expect(result.warnings.join(" ")).toContain("不代表此后没有更新");
    expect(result.warnings.join(" ")).toContain(searchUsage.fetchedAt);
  });

  it("checks the shared local cap even after the provider quota circuit opens", async () => {
    const directory = await mkdtemp(join(tmpdir(), "news-quota-circuit-"));
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ResponseMetadata: { Error: { Code: "10406", Message: "free quota exhausted" } },
          }),
          { status: 200 },
        ),
    );
    const glm = {
      search: vi.fn(async () => []),
      read: vi.fn(async () => {
        throw new Error("unused");
      }),
    };
    vi.stubGlobal("fetch", fetch);
    try {
      const topic = newsTopic("technology", ["one", "two"]);
      const result = await Effect.runPromise(
        generateRivusNewsBrief(
          { edition: "noon", occurrence: "2026-10-04T12:30:00+08:00" },
          {
            env: {
              DOUBAO_SEARCH_API_KEY: "test",
              NEWS_SEARCH_STATE_FILE: join(directory, "budget.json"),
              NEWS_SEARCH_DAILY_LIMIT: "1",
              NEWS_SEARCH_MODE: "hybrid",
            },
            now: () => new Date("2026-10-04T12:30:00+08:00"),
            glm,
            topics: [
              {
                ...topic,
                queries: topic.queries.map((query) => ({
                  ...query,
                  glm: { query: query.text, domains: ["example.com"] },
                })),
              },
            ],
          },
        ),
      );
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(glm.search).toHaveBeenCalledTimes(1);
      expect(result.audit.queries[1]).toMatchObject({
        status: "skipped",
        errorCode: "local_budget_exhausted",
      });
    } finally {
      vi.unstubAllGlobals();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("resolves non-overlapping noon and evening windows in the configured offset", () => {
    expect(resolveNewsEditionWindow("2026-07-29T04:30:00.000Z", "+08:00", "noon")).toMatchObject({
      day: "2026-07-29",
      since: Date.parse("2026-07-29T00:00:00+08:00"),
      until: Date.parse("2026-07-29T12:30:00+08:00"),
    });
    expect(resolveNewsEditionWindow("2026-07-29T11:00:00.000Z", "+08:00", "evening")).toMatchObject(
      {
        day: "2026-07-29",
        since: Date.parse("2026-07-29T12:30:00+08:00"),
        until: Date.parse("2026-07-29T19:00:00+08:00"),
      },
    );
  });

  it("searches every enabled topic query and renders one bounded mobile brief", async () => {
    const search = vi.fn(async ({ query }: { query: string }) => {
      const siteName = query.includes("政策") ? "权威政务媒体" : "Technology News";
      return {
        logId: `log:${query}`,
        resultCount: 1,
        timeCostMs: 20,
        results: [
          {
            id: query,
            title: `${query} headline`,
            url: `https://example.com/${encodeURIComponent(query)}`,
            summary: `${query} headline ${siteName} 2026-07-29 09:00:00 ${query} headline。苹果集中推送系统安全更新，覆盖手机、平板和电脑等产品线。此次更新修复多项高危漏洞，用户应尽快升级设备。这里是不会进入卡片的第三句冗长背景。`,
            siteName,
            publishTime: "2026-07-29T09:00:00+08:00",
            rankScore: 0.9,
            authInfoLevel: query.includes("政策") ? 1 : 2,
            authInfoDescription: query.includes("政策") ? "非常权威" : "正常权威",
            rankPosition: 1,
          },
        ],
      };
    });

    const result = withNewsMarkdown(
      await Effect.runPromise(
        generateRivusNewsBrief(
          { edition: "noon", occurrence: "2026-07-29T04:30:00.000Z" },
          {
            env: { DOUBAO_SEARCH_API_KEY: "test", FEED_TIMEZONE_OFFSET: "+08:00" },
            search,
            topics: [
              {
                id: "technology",
                label: "科技新闻",
                icon: "💻",
                enabled: true,
                sourcePolicy: "authoritative",
                maxItems: 3,
                queries: [
                  newsQuery("ai-agent", "AI Agent"),
                  newsQuery("developer-tools", "开发工具"),
                ],
              },
              {
                id: "politics",
                label: "政治新闻",
                icon: "🌍",
                enabled: true,
                sourcePolicy: "official",
                maxItems: 3,
                queries: [newsQuery("policy", "中国重要政策")],
              },
            ],
          },
        ),
      ),
    );

    expect(search).toHaveBeenCalledTimes(3);
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ day: "2026-07-29", sourcePolicy: "official" }),
    );
    expect(result).toMatchObject({ edition: "noon", itemCount: 3, day: "2026-07-29" });
    expect(result.audit).toMatchObject({
      counts: { fetched: 3, acceptedHits: 3, rejectedHits: 0, selectedStories: 3 },
      queries: [
        { queryId: "ai-agent", status: "ok", fetched: 1, accepted: 1 },
        { queryId: "developer-tools", status: "ok", fetched: 1, accepted: 1 },
        { queryId: "policy", status: "ok", fetched: 1, accepted: 1 },
      ],
    });
    expect(result.markdown).toContain("# 午间热点 · 2026-07-29");
    expect(result.markdown).toContain("**💻 科技 · 2**");
    expect(result.markdown).toContain("**🌍 政治 · 1**");
    expect(result.markdown).toContain("**1. [AI Agent headline](https://example.com/AI%20Agent)**");
    expect(result.markdown).toContain(
      "苹果集中推送系统安全更新，覆盖手机、平板和电脑等产品线。此次更新修复多项高危漏洞，用户应尽快升级设备。",
    );
    expect(result.markdown).toContain("Technology News · 09:00");
    expect(result.markdown).not.toContain("发生了什么");
    expect(result.markdown).not.toContain("为什么看");
    expect(result.markdown).not.toContain("建议：");
    expect(result.markdown).not.toContain("查看原文");
    expect(result.markdown).not.toContain("这里是不会进入卡片的第三句冗长背景");
    expect(result.markdown).not.toContain("utm_source");
  });

  it("continues after a partial query failure but fails when every query fails", async () => {
    const topics = [
      {
        id: "technology",
        label: "科技新闻",
        icon: "💻",
        enabled: true,
        sourcePolicy: "authoritative" as const,
        maxItems: 3,
        queries: [newsQuery("working", "working"), newsQuery("broken", "broken")],
      },
    ];
    const partial = await Effect.runPromise(
      generateRivusNewsBrief(
        { edition: "noon", occurrence: "2026-07-29T04:30:00.000Z" },
        {
          env: { DOUBAO_SEARCH_API_KEY: "test", FEED_TIMEZONE_OFFSET: "+08:00" },
          topics,
          search: async ({ query }) => {
            if (query === "broken") throw new Error("temporary search failure");
            return { logId: "ok", resultCount: 0, timeCostMs: 10, results: [] };
          },
        },
      ),
    );
    expect(partial.warnings).toEqual(["采集覆盖不完整：科技新闻；详见采集审计"]);
    expect(partial.audit.queries).toEqual([
      expect.objectContaining({ queryId: "working", status: "ok" }),
      expect.objectContaining({
        queryId: "broken",
        status: "failed",
        error: "temporary search failure",
      }),
    ]);

    const failure = await Effect.runPromise(
      Effect.flip(
        generateRivusNewsBrief(
          { edition: "noon", occurrence: "2026-07-29T04:30:00.000Z" },
          {
            env: { DOUBAO_SEARCH_API_KEY: "test", FEED_TIMEZONE_OFFSET: "+08:00" },
            topics,
            search: async () => {
              throw new DoubaoSearchError("10406", "free quota exhausted");
            },
          },
        ),
      ),
    );
    expect(failure).toMatchObject({
      name: AllDoubaoQueriesFailedError.name,
      result: {
        audit: {
          queries: [
            expect.objectContaining({
              queryId: "working",
              status: "failed",
              errorCode: "10406",
            }),
            expect.objectContaining({
              queryId: "broken",
              status: "failed",
              errorCode: "10406",
            }),
          ],
        },
        stories: [],
      },
    });
  });

  it("limits search concurrency to two while preserving query audit order", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const releases: Array<() => void> = [];
    const search = vi.fn(
      async () =>
        new Promise<{ resultCount: number; results: [] }>((resolve) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          releases.push(() => {
            inFlight -= 1;
            resolve({ resultCount: 0, results: [] });
          });
        }),
    );
    const resultPromise = Effect.runPromise(
      generateRivusNewsBrief(
        { edition: "noon", occurrence: "2026-07-29T04:30:00.000Z" },
        {
          env: { DOUBAO_SEARCH_API_KEY: "test", FEED_TIMEZONE_OFFSET: "+08:00" },
          search,
          maxQueries: 5,
          topics: [newsTopic("technology", ["one", "two", "three", "four", "five"])],
        },
      ),
    );

    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    releases.shift()!();
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(3));
    releases.shift()!();
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(4));
    releases.splice(0).forEach((release) => release());
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(5));
    releases.splice(0).forEach((release) => release());

    const result = await resultPromise;
    expect(maxInFlight).toBe(2);
    expect(result.audit.queries.map(({ queryId }) => queryId)).toEqual([
      "one",
      "two",
      "three",
      "four",
      "five",
    ]);
  });

  it("does not classify query configuration failures as provider unavailability", async () => {
    const failure = await Effect.runPromise(
      Effect.flip(
        generateRivusNewsBrief(
          { edition: "noon", occurrence: "2026-07-29T04:30:00.000Z" },
          {
            env: { DOUBAO_SEARCH_API_KEY: "test", FEED_TIMEZONE_OFFSET: "+08:00" },
            search: async () => {
              throw new Error("invalid query configuration");
            },
            topics: [newsTopic("technology", ["invalid"])],
          },
        ),
      ),
    );

    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure).not.toBeInstanceOf(AllDoubaoQueriesFailedError);
  });

  it("retries a transient Doubao rate limit and succeeds", async () => {
    const sleep = vi.fn(async () => undefined);
    const search = vi
      .fn()
      .mockRejectedValueOnce(new DoubaoSearchError("rate_limit_exceeded", "rate limit exceeded"))
      .mockResolvedValueOnce({ logId: "retry-ok", resultCount: 0, results: [] });

    const result = await Effect.runPromise(
      generateRivusNewsBrief(
        { edition: "noon", occurrence: "2026-07-29T04:30:00.000Z" },
        {
          env: { DOUBAO_SEARCH_API_KEY: "test", FEED_TIMEZONE_OFFSET: "+08:00" },
          random: () => 0.5,
          search,
          sleep,
          topics: [newsTopic("technology", ["retryable"])],
        },
      ),
    );

    expect(search).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(result.warnings).toEqual([]);
    expect(result.audit.queries[0]).toMatchObject({ queryId: "retryable", status: "ok" });
  });

  it("marks an exhausted rate limit unavailable after three attempts", async () => {
    const sleepDelays: number[] = [];
    const sleep = vi.fn(async (milliseconds: number) => {
      sleepDelays.push(milliseconds);
    });
    const search = vi.fn(async ({ query }: { query: string }) => {
      if (query === "limited") {
        throw new DoubaoSearchError("rate_limit_exceeded", "rate limit exceeded");
      }
      return { resultCount: 0, results: [] };
    });

    const result = await Effect.runPromise(
      generateRivusNewsBrief(
        { edition: "noon", occurrence: "2026-07-29T04:30:00.000Z" },
        {
          env: { DOUBAO_SEARCH_API_KEY: "test", FEED_TIMEZONE_OFFSET: "+08:00" },
          random: () => 0,
          search,
          sleep,
          topics: [newsTopic("technology", ["limited"]), newsTopic("policy", ["working"])],
        },
      ),
    );

    expect(search).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleepDelays).toEqual([125, 250]);
    expect(result.warnings).toEqual(["采集覆盖不完整：technology；详见采集审计"]);
    expect(result.audit.queries).toEqual([
      expect.objectContaining({ queryId: "limited", status: "failed" }),
      expect.objectContaining({ queryId: "working", status: "ok" }),
    ]);
  });

  it("does not retry non-transient search errors", async () => {
    const sleep = vi.fn(async () => undefined);
    const search = vi.fn(async ({ query }: { query: string }) => {
      if (query === "invalid") throw new Error("Doubao search query is invalid");
      return { resultCount: 0, results: [] };
    });

    const result = await Effect.runPromise(
      generateRivusNewsBrief(
        { edition: "noon", occurrence: "2026-07-29T04:30:00.000Z" },
        {
          env: { DOUBAO_SEARCH_API_KEY: "test", FEED_TIMEZONE_OFFSET: "+08:00" },
          search,
          sleep,
          topics: [newsTopic("technology", ["invalid", "working"])],
        },
      ),
    );

    expect(search).toHaveBeenCalledTimes(2);
    expect(sleep).not.toHaveBeenCalled();
    expect(result.audit.queries.map(({ queryId, status }) => ({ queryId, status }))).toEqual([
      { queryId: "invalid", status: "failed" },
      { queryId: "working", status: "ok" },
    ]);
  });

  it("honors Retry-After without jitter", async () => {
    const sleep = vi.fn(async () => undefined);
    const search = vi
      .fn()
      .mockRejectedValueOnce(
        new DoubaoSearchError("rate_limit_exceeded", "rate limit exceeded", {
          retryAfterMs: 1_500,
        }),
      )
      .mockResolvedValueOnce({ resultCount: 0, results: [] });

    await Effect.runPromise(
      generateRivusNewsBrief(
        { edition: "noon", occurrence: "2026-07-29T04:30:00.000Z" },
        {
          env: { DOUBAO_SEARCH_API_KEY: "test", FEED_TIMEZONE_OFFSET: "+08:00" },
          random: () => 0,
          search,
          sleep,
          topics: [newsTopic("technology", ["retry-after"])],
        },
      ),
    );

    expect(sleep).toHaveBeenCalledWith(1_500);
  });

  it("audits invalid publication dates without alarming on routine filtering", async () => {
    const result = await Effect.runPromise(
      generateRivusNewsBrief(
        { edition: "noon", occurrence: "2026-07-29T04:30:00.000Z" },
        {
          env: { DOUBAO_SEARCH_API_KEY: "test", FEED_TIMEZONE_OFFSET: "+08:00" },
          search: async () => ({
            logId: "ok",
            resultCount: 2,
            timeCostMs: 10,
            results: [
              {
                id: "fine",
                title: "Fine headline",
                url: "https://example.com/fine",
                summary: "fine summary",
                siteName: "Tech",
                publishTime: "2026-07-29T09:00:00+08:00",
                rankScore: 0.9,
                authInfoLevel: 2,
                authInfoDescription: "正常权威",
                rankPosition: 1,
              },
              {
                id: "no-time",
                title: "No publish time",
                url: "https://example.com/no-time",
                summary: "no time summary",
                siteName: "Tech",
                rankScore: 0.8,
                authInfoLevel: 2,
                authInfoDescription: "正常权威",
                rankPosition: 2,
              },
            ],
          }),
          topics: [
            {
              id: "technology",
              label: "科技新闻",
              icon: "💻",
              enabled: true,
              sourcePolicy: "authoritative",
              maxItems: 3,
              queries: [newsQuery("ai-agent", "AI Agent", ["summary"], ["fine"])],
            },
          ],
        },
      ),
    );

    expect(result.warnings).toEqual([]);
    expect(result.audit).toMatchObject({
      counts: { fetched: 2, acceptedHits: 1, rejectedHits: 1 },
      queries: [
        {
          queryId: "ai-agent",
          rejected: { "invalid-publish-time": 1 },
        },
      ],
    });
  });
});

function newsQuery(
  id: string,
  text: string,
  eventAny = ["安全更新"],
  subjectAny = [text],
): NewsTopicQuery {
  return {
    id,
    text,
    intent: "developer-change",
    subjectAny,
    eventAny,
    excludedAny: ["评测"],
  };
}

function newsTopic(id: string, queryIds: string[]) {
  return {
    id,
    label: id,
    icon: "📰",
    enabled: true,
    sourcePolicy: "authoritative" as const,
    maxItems: 3,
    queries: queryIds.map((queryId) => newsQuery(queryId, queryId)),
  };
}

it("runs hybrid search through the news application, merges evidence and preserves quota state", async () => {
  const url = "https://devblogs.microsoft.com/typescript/release";
  const publishedAt = "2026-07-29T01:00:00Z";
  const search = vi.fn(async () => ({
    resultCount: 1,
    results: [
      {
        id: "primary",
        title: "TypeScript released",
        url,
        summary: "TypeScript released a new compiler.",
        publishTime: publishedAt,
        authInfoLevel: 1,
        rankPosition: 1,
      },
    ],
  }));
  search.mockImplementationOnce(async () => ({
    resultCount: 1,
    results: [
      {
        id: "primary",
        title: "TypeScript released",
        url,
        summary: "TypeScript released a new compiler.",
        publishTime: publishedAt,
        authInfoLevel: 1,
        rankPosition: 1,
      },
    ],
  }));
  search.mockImplementation(async () => {
    throw new DoubaoSearchError("10406", "quota exhausted");
  });
  const glm = {
    search: vi.fn(async () => [
      { title: "TypeScript released", url, snippet: "TypeScript released a compiler" },
    ]),
    read: vi.fn(async () => ({
      title: "TypeScript released",
      url,
      content: "TypeScript released a new compiler.",
      truncated: false,
      publishedAt,
    })),
  };
  const result = await Effect.runPromise(
    generateRivusNewsBrief(
      { edition: "noon", occurrence: "2026-07-29T04:30:00Z" },
      {
        env: { NEWS_SEARCH_MODE: "hybrid" },
        search,
        glm,
        topics: [
          {
            id: "tools",
            label: "开发工具",
            icon: "💻",
            enabled: true,
            sourcePolicy: "official",
            maxItems: 3,
            queries: ["primary", "fallback", "skip-quota"].map((id) => ({
              id,
              text: id,
              intent: "developer-change",
              subjectAny: ["TypeScript"],
              eventAny: ["released"],
              excludedAny: [],
              glm: { query: "TypeScript released", domains: ["devblogs.microsoft.com"] },
            })),
          },
        ],
      },
    ),
  );
  expect(search).toHaveBeenCalledTimes(2);
  expect(glm.search).toHaveBeenCalledTimes(2);
  expect(glm.read).toHaveBeenCalledTimes(1);
  expect(result.itemCount).toBe(1);
  expect(result.stories[0].queryHits).toBe(3);
  expect(result.audit.counts).toMatchObject({ acceptedHits: 3, canonicalDuplicates: 2 });
  expect(result.audit.queries.map(({ provider }) => provider)).toEqual(["doubao", "glm", "glm"]);
  expect(result.warnings).toEqual([]);
  expect(result.sourceStatus?.state).toBe("recovered");
});

it("does not warn when both providers successfully return no candidates", async () => {
  const result = await Effect.runPromise(
    generateRivusNewsBrief(
      { edition: "noon", occurrence: "2026-07-29T12:30:00+08:00" },
      {
        env: { NEWS_SEARCH_MODE: "hybrid" },
        search: async () => ({ results: [], resultCount: 0 }),
        glm: {
          search: async () => [],
          read: async () => {
            throw new Error("unused");
          },
        },
        topics: [
          {
            id: "test",
            label: "test",
            icon: "",
            enabled: true,
            maxItems: 2,
            sourcePolicy: "official",
            queries: [
              {
                ...newsQuery("empty", "empty", ["TypeScript"], ["release"]),
                glm: { query: "TypeScript release", domains: ["devblogs.microsoft.com"] },
              },
            ],
          },
        ],
      },
    ),
  );
  expect(result.itemCount).toBe(0);
  expect(result.warnings).toEqual([]);
  expect(result.sourceStatus?.state).toBe("healthy");
});

it("recovers late-indexed and date-only articles in explicit catch-up without repeating delivered links", async () => {
  const make = (id: string, publishTime: string) => ({
    id,
    title: `TypeScript release ${id}`,
    summary: "TypeScript release",
    url: `https://example.com/${id}`,
    publishTime,
    authInfoLevel: 1,
    rankPosition: 1,
  });
  const calls: DoubaoSearchInput[] = [];
  const result = await Effect.runPromise(
    generateRivusNewsBrief(
      {
        edition: "evening",
        occurrence: "2026-07-29T22:00:00+08:00",
        since: "2026-07-27T18:00:00+08:00",
        reportedUrls: ["https://example.com/delivered?utm_source=feed"],
      },
      {
        env: {},
        search: async (input) => {
          calls.push(input);
          return {
            results: [
              make("late", "2026-07-29T09:00:00+08:00"),
              make("date-only", "2026-07-28"),
              make("delivered", "2026-07-29T09:00:00+08:00"),
              make("uncertain", "2026-07-29"),
            ],
            resultCount: 4,
          };
        },
        topics: [
          {
            id: "test",
            label: "test",
            icon: "",
            enabled: true,
            maxItems: 4,
            sourcePolicy: "official",
            queries: [newsQuery("ts", "TypeScript release", ["TypeScript"], ["release"])],
          },
        ],
      },
    ),
  );
  expect(calls[0].sinceDay).toBe("2026-07-27");
  expect(result.stories.map((s) => s.canonicalUrl).sort()).toEqual([
    "https://example.com/date-only",
    "https://example.com/late",
  ]);
  expect(result.audit.queries[0].rejected).toMatchObject({
    "already-reported": 1,
    "outside-window": 1,
  });
});

it("rotates source plans between local noon and evening, including even-sized source lists", async () => {
  const calls: string[] = [];
  for (const [edition, occurrence] of [
    ["noon", "2026-07-29T12:30:00+08:00"],
    ["evening", "2026-07-29T18:00:00+08:00"],
    ["noon", "2026-07-30T12:30:00+08:00"],
    ["evening", "2026-07-30T18:00:00+08:00"],
  ] as const) {
    await Effect.runPromise(
      generateRivusNewsBrief(
        { edition, occurrence },
        {
          env: {},
          search: async (input) => {
            calls.push(input.query);
            return { results: [], resultCount: 0 };
          },
          topics: [
            {
              id: "test",
              label: "test",
              icon: "",
              enabled: true,
              maxItems: 1,
              sourcePolicy: "official",
              queries: [
                {
                  ...newsQuery("test", "broad", ["AI"], ["release"]),
                  glm: {
                    query: "release",
                    domains: ["a.com", "b.com", "c.com", "d.com"],
                    sourceQueries: {
                      "a.com": "A release",
                      "b.com": "B release",
                      "c.com": "C release",
                      "d.com": "D release",
                    },
                  },
                },
              ],
            },
          ],
        },
      ),
    );
  }
  expect(new Set(calls).size).toBe(4);
});

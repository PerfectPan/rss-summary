import { Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  generateRivusNewsBrief,
  resolveNewsEditionWindow,
  type RivusNewsBriefResult,
} from "../../src/application/news-brief.js";
import type { NewsTopicQuery } from "../../src/domain/news.js";
import { DoubaoSearchError } from "../../src/infrastructure/doubao-search.js";
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
    expect(partial.warnings).toEqual(["科技新闻：1 个查询暂不可用"]);
    expect(partial.audit.queries).toEqual([
      expect.objectContaining({ queryId: "working", status: "ok" }),
      expect.objectContaining({
        queryId: "broken",
        status: "failed",
        error: "temporary search failure",
      }),
    ]);

    await expect(
      Effect.runPromise(
        generateRivusNewsBrief(
          { edition: "noon", occurrence: "2026-07-29T04:30:00.000Z" },
          {
            env: { DOUBAO_SEARCH_API_KEY: "test", FEED_TIMEZONE_OFFSET: "+08:00" },
            topics,
            search: async () => {
              throw new Error("down");
            },
          },
        ),
      ),
    ).rejects.toThrow(/all.*search/i);
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
    expect(result.warnings).toEqual(["technology：1 个查询暂不可用"]);
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

  it("warns when Doubao hits lack a parseable publish time", async () => {
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

    expect(result.warnings).toContain("Doubao 搜索：1 条结果缺少有效的发布时间被丢弃");
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

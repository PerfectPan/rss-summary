import { Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";

import { generateDailyAiDigest } from "../../src/application/daily-ai-digest.js";
import {
  AllNewsQueriesFailedError,
  type RivusNewsBriefResult,
} from "../../src/application/news-brief.js";
import * as newsBrief from "../../src/application/news-brief.js";
import type { IndustryBriefDocument } from "../../src/application/industry-brief.js";

describe("Daily AI digest use case", () => {
  it("collects news once for the rolling 24 hours before the occurrence", async () => {
    const calls: string[] = [];
    const result = await generateDailyAiDigest(
      { occurrence: "2026-08-11T01:00:00.000Z" },
      {
        env: { FEED_TIMEZONE_OFFSET: "+08:00" },
        industry: async (window) => {
          calls.push(`official:${window.since}:${window.until}`);
          return officialDocument();
        },
        news: async (occurrence, edition, since) => {
          calls.push(`${edition}:${occurrence}:${since}`);
          return newsResult(edition);
        },
      },
    );
    expect(result.day).toBe("2026-08-11");
    expect(result.windowLabel).toBe("2026-08-10 09:00–2026-08-11 09:00 +08:00");
    expect(calls).toEqual([
      "noon:2026-08-11T01:00:00.000Z:2026-08-10T01:00:00.000Z",
      "official:2026-08-10T01:00:00.000Z:2026-08-11T01:00:00.000Z",
    ]);
    expect(result.sourceAudit.news).toEqual([
      { day: "2026-08-11", edition: "noon", audit: emptyNewsAudit() },
    ]);
  });

  it.each([
    {
      occurrence: "2026-08-11T04:30:00.000Z",
      timezoneOffset: "+08:00",
      edition: "noon",
      day: "2026-08-11",
      since: "2026-08-10T04:30:00.000Z",
    },
    {
      occurrence: "2026-08-11T04:30:00.001Z",
      timezoneOffset: "+08:00",
      edition: "evening",
      day: "2026-08-11",
      since: "2026-08-10T04:30:00.001Z",
    },
    {
      occurrence: "2026-08-11T09:00:00.000Z",
      timezoneOffset: "+08:00",
      edition: "evening",
      day: "2026-08-11",
      since: "2026-08-10T09:00:00.000Z",
    },
    {
      occurrence: "2026-01-01T01:10:00.000Z",
      timezoneOffset: "-05:00",
      edition: "evening",
      day: "2025-12-31",
      since: "2025-12-31T01:10:00.000Z",
    },
    {
      occurrence: "2025-12-31T18:30:00.000Z",
      timezoneOffset: "+05:30",
      edition: "noon",
      day: "2026-01-01",
      since: "2025-12-30T18:30:00.000Z",
    },
  ])("preserves the complete window at $occurrence in $timezoneOffset", async (testCase) => {
    const publishedAt = new Date(Date.parse(testCase.occurrence) - 1).toISOString();
    const news = vi.fn(async (_occurrence: string, edition: "noon" | "evening") =>
      newsResult(edition, [story("recent", publishedAt)]),
    );
    const result = await generateDailyAiDigest(
      { occurrence: testCase.occurrence },
      {
        env: { FEED_TIMEZONE_OFFSET: testCase.timezoneOffset },
        news,
        industry: async () => ({ generatedAt: testCase.occurrence, candidates: [] }),
      },
    );

    expect(news).toHaveBeenCalledExactlyOnceWith(
      testCase.occurrence,
      testCase.edition,
      testCase.since,
    );
    expect(result.day).toBe(testCase.day);
    expect(result.evidence.map(({ id }) => id)).toEqual(["news:recent"]);
    expect(result.sourceAudit.news).toHaveLength(1);
    expect(result.sourceAudit.news[0]).toMatchObject({
      day: testCase.day,
      edition: testCase.edition,
    });
  });

  it.each([
    { env: { FEED_TIMEZONE_OFFSET: "+08:00" }, maxQueries: 6 },
    {
      env: { FEED_TIMEZONE_OFFSET: "+08:00", DAILY_AI_NEWS_MAX_QUERIES: "3" },
      maxQueries: 3,
    },
  ])(
    "passes the rolling window and $maxQueries query cap to the default news collector",
    async ({ env, maxQueries }) => {
      const collector = vi
        .spyOn(newsBrief, "generateRivusNewsBrief")
        .mockReturnValue(Effect.succeed(newsResult("noon")));
      try {
        await generateDailyAiDigest(
          { occurrence: "2026-08-11T01:10:00.000Z" },
          { env, industry: async () => officialDocument() },
        );

        expect(collector).toHaveBeenCalledExactlyOnceWith(
          {
            occurrence: "2026-08-11T01:10:00.000Z",
            edition: "noon",
            since: "2026-08-10T01:10:00.000Z",
          },
          { env, maxQueries },
        );
      } finally {
        collector.mockRestore();
      }
    },
  );

  it("filters every collector result to the exact half-open rolling window", async () => {
    const result = await generateDailyAiDigest(
      { occurrence: "2026-08-11T01:00:00.000Z" },
      {
        env: { FEED_TIMEZONE_OFFSET: "+08:00" },
        industry: async () => officialDocument(),
        news: async (_occurrence, edition) =>
          newsResult(edition, [
            story("before", "2026-08-10T00:59:59.999Z"),
            story("start", "2026-08-10T01:00:00.000Z"),
            story("end", "2026-08-11T01:00:00.000Z"),
          ]),
      },
    );

    expect(result.evidence.map(({ id }) => id)).toEqual(["news:start", "official:rss-1"]);
  });

  it("continues official collection and retains search coverage warnings on a known news failure", async () => {
    const calls: string[] = [];
    const result = await generateDailyAiDigest(
      { occurrence: "2026-08-11T01:00:00.000Z" },
      {
        env: { FEED_TIMEZONE_OFFSET: "+08:00" },
        industry: async () => {
          calls.push("official");
          return officialDocument();
        },
        news: async (_occurrence, edition) => {
          calls.push(edition);
          const failure = failedEdition(edition);
          failure.result.warnings.push("采集覆盖不完整：开发工具；详见采集审计");
          throw failure;
        },
      },
    );

    expect(calls).toEqual(["noon", "official"]);
    expect(result.evidence.map(({ id }) => id)).toEqual(["official:rss-1"]);
    expect(result.items).toEqual([]);
    expect(result.warnings).toEqual([
      "采集覆盖不完整：开发工具；详见采集审计",
      "新闻搜索暂不可用：所有查询均失败，本期仅使用官方来源",
    ]);
    expect(result.sourceAudit.news[0]?.audit.queries[0]).toMatchObject({
      status: "failed",
      errorCode: "10406",
    });
  });

  it("publishes official evidence when all news queries fail", async () => {
    const result = await generateDailyAiDigest(
      { occurrence: "2026-08-11T01:00:00.000Z" },
      {
        env: { FEED_TIMEZONE_OFFSET: "+08:00" },
        industry: async () => officialDocument(),
        news: async (_occurrence, edition) => {
          throw failedEdition(edition);
        },
      },
    );

    expect(result.evidence.map(({ id }) => id)).toEqual(["official:rss-1"]);
    expect(result.warnings).toEqual(["新闻搜索暂不可用：所有查询均失败，本期仅使用官方来源"]);
    expect(result.sourceAudit.news).toHaveLength(1);
    expect(result.sourceAudit.news[0]?.audit.queries[0]).toMatchObject({ errorCode: "10406" });
  });

  it("fails only when every collector yields no usable evidence", async () => {
    await expect(
      generateDailyAiDigest(
        { occurrence: "2026-08-11T01:00:00.000Z" },
        {
          env: { FEED_TIMEZONE_OFFSET: "+08:00" },
          industry: async () => ({ generatedAt: "2026-08-11T01:00:00Z", candidates: [] }),
          news: async (_occurrence, edition) => {
            throw failedEdition(edition);
          },
        },
      ),
    ).rejects.toThrow(
      "Daily AI digest has no usable evidence from news search or official sources.",
    );
  });

  it("does not degrade unexpected news collector errors", async () => {
    let officialCalled = false;
    await expect(
      generateDailyAiDigest(
        { occurrence: "2026-08-11T01:00:00.000Z" },
        {
          env: { FEED_TIMEZONE_OFFSET: "+08:00" },
          industry: async () => {
            officialCalled = true;
            return officialDocument();
          },
          news: async () => {
            throw new Error("invalid query configuration");
          },
        },
      ),
    ).rejects.toThrow("invalid query configuration");
    expect(officialCalled).toBe(false);
  });

  it("combines authoritative search and official source evidence into grounded items", async () => {
    const result = await generateDailyAiDigest(
      { occurrence: "2026-08-11T01:00:00.000Z" },
      {
        env: { FEED_TIMEZONE_OFFSET: "+08:00" },
        industry: async () => ({
          generatedAt: "2026-08-11T01:00:00Z",
          candidates: [
            {
              repo: "rss:openai",
              source: "rss",
              category: "release",
              score: 80,
              actors: ["OpenAI"],
              eventTypes: ["release"],
              reasons: [],
              events: [
                {
                  id: "rss-1",
                  type: "release",
                  source: "rss",
                  actor: "OpenAI",
                  repo: "rss:openai",
                  createdAt: "2026-08-10T02:00:00Z",
                  title: "Codex 2.0",
                  summary: "更可靠的工具调用",
                  htmlUrl: "https://openai.com/codex-2",
                  sourceName: "OpenAI",
                },
              ],
              label: "Codex 2.0",
              url: "https://openai.com/codex-2",
              description: "更可靠的工具调用",
            },
          ],
        }),
        news: async (_occurrence, edition) => ({
          audit: {} as never,
          day: "2026-08-10",
          edition,
          generatedAt: "2026-08-11T01:00:00Z",
          itemCount: edition === "noon" ? 1 : 0,
          warnings: ["one source unavailable"],
          windowLabel: "",
          stories:
            edition === "noon"
              ? [
                  {
                    id: "n1",
                    title: "Anthropic 为 Claude 输出新增机器可读标记",
                    canonicalUrl: "https://anthropic.com/news/markers",
                    summary: "覆盖所有产品线",
                    siteName: "Anthropic",
                    publishTime: "2026-08-10T03:00:00Z",
                    rankScore: 1,
                    authInfoLevel: 1,
                    topicIds: ["developer-tools"],
                    topicLabels: ["开发"],
                    queryIds: ["q1"],
                    queries: ["q"],
                    queryHits: 1,
                    scoreBreakdown: { rank: 1, authority: 1, freshness: 1, crossQuery: 0 },
                    score: 3,
                    selectedTopicId: "developer-tools",
                  },
                ]
              : [],
          topics: [],
        }),
      },
    );
    expect(result.evidence).toHaveLength(2);
    expect(result.items).toEqual([]);
    expect(result.warnings).toEqual(["one source unavailable"]);
    expect(result.deliveryReceipt.evidenceIds).toHaveLength(0);
  });
});

function newsResult(
  edition: "noon" | "evening",
  stories: RivusNewsBriefResult["stories"] = [],
): RivusNewsBriefResult {
  return {
    audit: emptyNewsAudit(),
    day: "2026-08-10",
    edition,
    generatedAt: "2026-08-11T01:00:00Z",
    itemCount: stories.length,
    warnings: [],
    windowLabel: "",
    stories,
    topics: [],
  };
}

function story(id: string, publishTime: string): RivusNewsBriefResult["stories"][number] {
  return {
    id,
    title: `Story ${id}`,
    canonicalUrl: `https://example.com/${id}`,
    summary: id,
    siteName: "Example",
    publishTime,
    rankScore: 1,
    authInfoLevel: 1,
    topicIds: ["developer-tools"],
    topicLabels: ["开发"],
    queryIds: ["q1"],
    queries: ["q"],
    queryHits: 1,
    scoreBreakdown: { rank: 1, authority: 1, freshness: 1, crossQuery: 0 },
    score: 3,
    selectedTopicId: "developer-tools",
  };
}

function failedEdition(edition: "noon" | "evening"): AllNewsQueriesFailedError {
  return new AllNewsQueriesFailedError({
    ...newsResult(edition),
    audit: {
      ...emptyNewsAudit(),
      queries: [
        {
          queryId: `${edition}-q1`,
          query: "AI update",
          intent: "developer-change",
          topicId: "developer-tools",
          topicLabel: "开发工具",
          status: "failed",
          fetched: 0,
          accepted: 0,
          rejected: {},
          errorCode: "10406",
          error: "Doubao search API error 10406: free quota exhausted",
        },
      ],
    },
  });
}

function emptyNewsAudit(): RivusNewsBriefResult["audit"] {
  return {
    queries: [],
    counts: {
      fetched: 0,
      acceptedHits: 0,
      rejectedHits: 0,
      canonicalDuplicates: 0,
      deduplicatedStories: 0,
      selectedStories: 0,
      duplicateTitleStories: 0,
      topicQuotaFilteredStories: 0,
      briefCapFilteredStories: 0,
    },
  };
}

function officialDocument(): IndustryBriefDocument {
  return {
    generatedAt: "2026-08-11T01:00:00Z",
    candidates: [
      {
        repo: "rss:openai",
        source: "rss" as const,
        category: "release" as const,
        score: 80,
        actors: ["OpenAI"],
        eventTypes: ["release"],
        reasons: [],
        events: [
          {
            id: "rss-1",
            type: "release" as const,
            source: "rss" as const,
            actor: "OpenAI",
            repo: "rss:openai",
            createdAt: "2026-08-10T02:00:00Z",
            title: "OpenAI 发布 Codex 2.0",
            summary: "更可靠的工具调用",
            htmlUrl: "https://openai.com/codex-2",
            sourceName: "OpenAI",
          },
        ],
        label: "OpenAI 发布 Codex 2.0",
        url: "https://openai.com/codex-2",
        description: "更可靠的工具调用",
      },
    ],
  };
}

it("retains unverified Grok source labels and warnings in Daily AI evidence", async () => {
  const item = {
    ...story("grok", "2026-08-10T12:00:00Z"),
    authInfoLevel: 4,
    siteName: "@OpenAI · X（Grok 整理）",
  };
  const result = await generateDailyAiDigest(
    { occurrence: "2026-08-11T01:00:00Z" },
    {
      env: {},
      news: async (_occurrence, edition) => ({
        ...newsResult(edition, [item]),
        warnings: ["Grok 内容未独立核验"],
      }),
      industry: async () => ({ generatedAt: "2026-08-11T01:00:00Z", candidates: [] }),
    },
  );
  expect(result.evidence[0]).toMatchObject({
    tier: "unverified",
    sourceName: "@OpenAI · X（Grok 整理）",
  });
  expect(result.warnings).toContain("Grok 内容未独立核验");
});

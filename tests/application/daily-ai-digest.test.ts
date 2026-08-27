import { describe, expect, it } from "vite-plus/test";

import { generateDailyAiDigest } from "../../src/application/daily-ai-digest.js";
import {
  AllDoubaoQueriesFailedError,
  type RivusNewsBriefResult,
} from "../../src/application/news-brief.js";
import type { IndustryBriefDocument } from "../../src/application/industry-brief.js";

describe("Daily AI digest use case", () => {
  it("uses the previous Asia/Shanghai calendar day", async () => {
    const calls: string[] = [];
    const result = await generateDailyAiDigest(
      { occurrence: "2026-08-11T01:00:00.000Z" },
      {
        env: { FEED_TIMEZONE_OFFSET: "+08:00" },
        industry: async (day) => {
          calls.push(day);
          return officialDocument();
        },
        news: async (occurrence, edition) => {
          calls.push(`${edition}:${occurrence}`);
          return {
            audit: {} as never,
            day: "2026-08-10",
            edition,
            generatedAt: "2026-08-11T01:00:00Z",
            itemCount: 0,
            warnings: [],
            windowLabel: "",
            stories: [],
            topics: [],
          };
        },
      },
    );
    expect(result.day).toBe("2026-08-10");
    expect(calls).toEqual([
      "noon:2026-08-10T12:30:00+08:00",
      "evening:2026-08-10T23:59:59+08:00",
      "2026-08-10",
    ]);
  });

  it("continues the evening and official collectors when the noon Doubao edition fails", async () => {
    const calls: string[] = [];
    const result = await generateDailyAiDigest(
      { occurrence: "2026-08-11T01:00:00.000Z" },
      {
        env: { FEED_TIMEZONE_OFFSET: "+08:00" },
        industry: async () => {
          calls.push("official");
          return { generatedAt: "2026-08-11T01:00:00Z", candidates: [] };
        },
        news: async (_occurrence, edition) => {
          calls.push(edition);
          if (edition === "noon") throw failedEdition(edition);
          return newsResult(edition, [
            {
              id: "n1",
              title: "Anthropic 为 Claude 输出新增机器可读标记",
              canonicalUrl: "https://anthropic.com/news/markers",
              summary: "覆盖所有产品线",
              siteName: "Anthropic",
              publishTime: "2026-08-10T13:00:00+08:00",
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
          ]);
        },
      },
    );

    expect(calls).toEqual(["noon", "evening", "official"]);
    expect(result.items).toHaveLength(1);
    expect(result.warnings).toEqual(["午间 Doubao 搜索全部不可用，已继续使用晚间和官方来源"]);
    expect(result.sourceAudit.news.noon.queries[0]).toMatchObject({
      status: "failed",
      errorCode: "10406",
    });
  });

  it("publishes official evidence when both Doubao editions fail", async () => {
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
    expect(result.warnings).toEqual([
      "Doubao 搜索暂不可用：午间、晚间查询全部失败，本期仅使用官方来源",
    ]);
    expect(result.sourceAudit.news.evening.queries[0]).toMatchObject({ errorCode: "10406" });
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
    ).rejects.toThrow("Daily AI digest has no usable evidence from Doubao or official sources.");
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
          warnings: edition === "evening" ? ["one source unavailable"] : [],
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
    expect(result.items.map(({ headline }) => headline)).toEqual([
      "Anthropic 为 Claude 输出新增机器可读标记",
    ]);
    expect(result.warnings).toEqual(["one source unavailable"]);
    expect(result.deliveryReceipt.evidenceIds).toHaveLength(1);
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

function failedEdition(edition: "noon" | "evening"): AllDoubaoQueriesFailedError {
  return new AllDoubaoQueriesFailedError({
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

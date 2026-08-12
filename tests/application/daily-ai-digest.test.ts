import { describe, expect, it } from "vite-plus/test";

import { generateDailyAiDigest } from "../../src/application/daily-ai-digest.js";

describe("Daily AI digest use case", () => {
  it("uses the previous Asia/Shanghai calendar day", async () => {
    const calls: string[] = [];
    const result = await generateDailyAiDigest(
      { occurrence: "2026-08-11T01:00:00.000Z" },
      {
        env: { FEED_TIMEZONE_OFFSET: "+08:00" },
        industry: async (day) => {
          calls.push(day);
          return { generatedAt: "2026-08-11T01:00:00Z", candidates: [] };
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
      "OpenAI 发布「Codex 2.0」",
    ]);
    expect(result.warnings).toEqual(["one source unavailable"]);
    expect(result.deliveryReceipt.evidenceIds).toHaveLength(2);
  });
});

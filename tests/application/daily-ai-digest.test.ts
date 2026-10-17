import { describe, expect, it, vi } from "vite-plus/test";

import { generateDailyAiDigest } from "../../src/application/daily-ai-digest.js";
import * as newsBrief from "../../src/application/news-brief.js";
import type { IndustryBriefDocument } from "../../src/application/industry-brief.js";
import type { XAccountPosts } from "../../src/acquisition/index.js";

import { RssClient } from "../../src/acquisition/infra/adapters/rss-http.js";
import { WebPageClient } from "../../src/acquisition/infra/adapters/web-page-http.js";

const occurrence = "2026-08-11T01:00:00.000Z";
const emptyAccounts = async (): Promise<XAccountPosts> => ({ posts: [], audit: [] });
function post(id: string, publishedAt: string): XAccountPosts["posts"][number] {
  return {
    id,
    author: "claudedevs",
    publishedAt,
    title: `Claude ${id}`,
    summary: "作者分享工具使用经验",
    url: `https://x.com/claudedevs/status/${id}`,
  };
}

describe("Daily AI subscriptions", () => {
  it("excludes paper sources before fetching while retaining official research sources", async () => {
    const sources = [
      { name: "arXiv AI", url: "https://rss.arxiv.org/rss/cs.AI", tags: [] },
      { name: "arXiv CL", url: "https://arxiv.org/rss/cs.CL", tags: [] },
      { name: "Paper mirror", url: "https://example.com/papers", tags: ["Papers", "Academic"] },
      {
        name: "DeepMind Research",
        url: "https://deepmind.google/blog/rss.xml",
        tags: ["Research"],
      },
      {
        type: "page",
        name: "Anthropic Research",
        url: "https://www.anthropic.com/research",
        pathPrefixes: ["/research/"],
        tags: ["Research"],
      },
    ];
    const rss = vi
      .spyOn(RssClient.prototype, "getFeedEvents")
      .mockResolvedValue(officialDocument().candidates[0]!.events);
    const page = vi.spyOn(WebPageClient.prototype, "getEvents").mockResolvedValue([]);
    try {
      const result = await generateDailyAiDigest(
        { occurrence },
        {
          xAccounts: emptyAccounts,
          env: {
            INDUSTRY_SOURCES: JSON.stringify(sources),
            RSS_FEEDS: "[]",
            INDUSTRY_STATE_FILE: "/nonexistent/daily-ai-paper-filter-test.json",
          },
        },
      );
      expect(rss).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: "DeepMind Research" }),
      );
      expect(page).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: "Anthropic Research" }),
      );
      expect(result.sourceAudit.industry?.sources.map(({ name }) => name)).toEqual([
        "DeepMind Research",
        "Anthropic Research",
      ]);
      expect(sources).toHaveLength(5);
      expect(result.evidence).toHaveLength(1);
    } finally {
      rss.mockRestore();
      page.mockRestore();
    }
  });

  it("uses one rolling window for official sources and the default ClaudeDevs account", async () => {
    const xAccounts = vi.fn(emptyAccounts);
    const industry = vi.fn(async () => officialDocument());
    const env = { FEED_TIMEZONE_OFFSET: "+08:00" };
    const result = await generateDailyAiDigest({ occurrence }, { env, xAccounts, industry });
    const window = { since: "2026-08-10T01:00:00.000Z", until: occurrence };
    expect(xAccounts).toHaveBeenCalledExactlyOnceWith(
      { ...window, handles: ["ClaudeDevs"] },
      { env, now: undefined },
    );
    expect(industry).toHaveBeenCalledExactlyOnceWith(window, env);
    expect(result.windowLabel).toBe("2026-08-10 09:00–2026-08-11 09:00 +08:00");
    expect(result.sourceAudit).toEqual({ xAccounts: [] });
  });

  it("never invokes broad news search, even with an invalid news mode and no search API keys", async () => {
    const news = vi.spyOn(newsBrief, "generateRivusNewsBrief");
    try {
      const result = await generateDailyAiDigest(
        { occurrence },
        {
          env: {
            DAILY_AI_X_HANDLES: "",
            NEWS_SEARCH_MODE: "invalid",
            DAILY_AI_NEWS_MAX_QUERIES: "32",
          },
          industry: async () => officialDocument(),
        },
      );
      expect(news).not.toHaveBeenCalled();
      expect(result.evidence).toHaveLength(1);
      expect(result.sourceAudit.xAccounts).toEqual([]);
    } finally {
      news.mockRestore();
    }
  });

  it("passes configured accounts without imposing a newsworthiness filter", async () => {
    const xAccounts = vi.fn(
      async (_value: { handles: string[] }): Promise<XAccountPosts> => ({
        posts: [post("experience", "2026-08-10T03:00:00Z")],
        audit: [],
      }),
    );
    const result = await generateDailyAiDigest(
      { occurrence },
      {
        env: { DAILY_AI_X_HANDLES: " ClaudeDevs, @Jason_Young1231 " },
        xAccounts,
        industry: async () => officialDocument(),
      },
    );
    expect(xAccounts.mock.calls[0]?.[0]).toMatchObject({
      handles: ["ClaudeDevs", "@Jason_Young1231"],
    });
    expect(result.evidence).toHaveLength(2);
    expect(result.evidence.find(({ id }) => id === "x:experience")).toMatchObject({
      tier: "unverified",
      sourceName: "@claudedevs · X（Grok 整理）",
    });
    expect(result.items).toEqual([]);
    expect(result.deliveryReceipt.evidenceIds).toEqual([]);
  });

  it("filters both sources to the exact half-open window", async () => {
    const result = await generateDailyAiDigest(
      { occurrence },
      {
        env: {},
        industry: async () => officialDocument(),
        xAccounts: async () => ({
          posts: [
            post("before", "2026-08-10T00:59:59.999Z"),
            post("start", "2026-08-10T01:00:00.000Z"),
            post("end", occurrence),
          ],
          audit: [],
        }),
      },
    );
    expect(result.evidence.map(({ id }) => id)).toEqual(["x:start", "official:rss-1"]);
  });

  it("retains account failure audit and continues with official evidence without filler", async () => {
    const audit: XAccountPosts["audit"] = [
      { handle: "claudedevs", status: "failed", acceptedCount: 0, errorCode: "grok_cli_failed" },
    ];
    const result = await generateDailyAiDigest(
      { occurrence },
      {
        env: {},
        industry: async () => officialDocument(),
        xAccounts: async () => ({ posts: [], audit }),
      },
    );
    expect(result.evidence.map(({ id }) => id)).toEqual(["official:rss-1"]);
    expect(result.sourceAudit.xAccounts).toEqual(audit);
    expect(result.warnings).toEqual([]);
  });

  it("keeps X evidence when official sources return no candidates", async () => {
    const result = await generateDailyAiDigest(
      { occurrence },
      {
        env: {},
        industry: async () => ({ generatedAt: occurrence, candidates: [] }),
        xAccounts: async () => ({ posts: [post("only", "2026-08-10T03:00:00Z")], audit: [] }),
      },
    );
    expect(result.evidence.map(({ id }) => id)).toEqual(["x:only"]);
  });

  it("fails when all sources lack usable evidence", async () => {
    await expect(
      generateDailyAiDigest(
        { occurrence },
        {
          env: {},
          industry: async () => ({ generatedAt: occurrence, candidates: [] }),
          xAccounts: emptyAccounts,
        },
      ),
    ).rejects.toThrow("no usable evidence");
  });

  it("does not hide configuration errors as a source outage", async () => {
    await expect(
      generateDailyAiDigest(
        { occurrence },
        {
          env: { DAILY_AI_X_HANDLES: "invalid/query" },
          industry: async () => officialDocument(),
        },
      ),
    ).rejects.toThrow();
  });

  it("retains official source failure diagnostics", async () => {
    const result = await generateDailyAiDigest(
      { occurrence },
      {
        env: {},
        xAccounts: emptyAccounts,
        industry: async () => ({
          ...officialDocument(),
          audit: {
            version: 2,
            runId: "test",
            product: "frontier",
            generatedAt: occurrence,
            sources: [
              {
                id: "xai",
                kind: "web-page",
                name: "xAI News",
                status: "failed",
                itemCount: 0,
                error: "HTTP 403",
              },
            ],
            counts: { fetched: 1, inWindow: 1, ranked: 1, selected: 1, researchPending: 0 },
            candidates: [],
          },
        }),
      },
    );
    expect(result.warnings).toContain("官方来源采集不完整：xAI News（HTTP 403）");
  });
});

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

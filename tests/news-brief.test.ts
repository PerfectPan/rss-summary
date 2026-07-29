import { describe, expect, it, vi } from "vitest";

import { generateRivusNewsBrief, resolveNewsEditionWindow } from "../src/news-brief.js";

describe("Rivus news brief Tool adapter", () => {
  it("resolves non-overlapping noon and evening windows in the configured offset", () => {
    expect(resolveNewsEditionWindow("2026-07-29T04:30:00.000Z", "+08:00", "noon")).toMatchObject({
      day: "2026-07-29",
      since: Date.parse("2026-07-29T00:00:00+08:00"),
      until: Date.parse("2026-07-29T12:30:00+08:00"),
    });
    expect(resolveNewsEditionWindow("2026-07-29T11:00:00.000Z", "+08:00", "evening")).toMatchObject({
      day: "2026-07-29",
      since: Date.parse("2026-07-29T12:30:00+08:00"),
      until: Date.parse("2026-07-29T19:00:00+08:00"),
    });
  });

  it("searches every enabled topic query and renders one bounded mobile brief", async () => {
    const search = vi.fn(async ({ query }: { query: string }) => ({
      logId: `log:${query}`,
      resultCount: 1,
      timeCostMs: 20,
      results: [
        {
          id: query,
          title: `${query} headline`,
          url: `https://example.com/${encodeURIComponent(query)}`,
          summary: "Confirmed update with a concise summary.",
          siteName: query.includes("政策") ? "权威政务媒体" : "Technology News",
          publishTime: "2026-07-29T09:00:00+08:00",
          rankScore: 0.9,
          authInfoLevel: query.includes("政策") ? 1 : 2,
          authInfoDescription: query.includes("政策") ? "非常权威" : "正常权威",
        },
      ],
    }));

    const result = await generateRivusNewsBrief(
      { edition: "noon", occurrence: "2026-07-29T04:30:00.000Z" },
      {
        env: { DOUBAO_SEARCH_API_KEY: "test", FEED_TIMEZONE_OFFSET: "+08:00" },
        search,
        topics: [
          {
            id: "technology",
            label: "科技新闻",
            enabled: true,
            sourcePolicy: "authoritative",
            maxItems: 3,
            queries: ["AI Agent", "开发工具"],
          },
          {
            id: "politics",
            label: "政治新闻",
            enabled: true,
            sourcePolicy: "official",
            maxItems: 3,
            queries: ["中国重要政策"],
          },
        ],
      },
    );

    expect(search).toHaveBeenCalledTimes(3);
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ day: "2026-07-29", sourcePolicy: "official" }),
    );
    expect(result).toMatchObject({ edition: "noon", itemCount: 3, day: "2026-07-29" });
    expect(result.markdown).toContain("# 午间热点 · 2026-07-29");
    expect(result.markdown).toContain("**💻 科技新闻**");
    expect(result.markdown).toContain("**🌍 政治新闻**");
    expect(result.markdown).not.toContain("utm_source");
  });

  it("continues after a partial query failure but fails when every query fails", async () => {
    const topics = [
      {
        id: "technology",
        label: "科技新闻",
        enabled: true,
        sourcePolicy: "authoritative" as const,
        maxItems: 3,
        queries: ["working", "broken"],
      },
    ];
    const partial = await generateRivusNewsBrief(
      { edition: "noon", occurrence: "2026-07-29T04:30:00.000Z" },
      {
        env: { DOUBAO_SEARCH_API_KEY: "test", FEED_TIMEZONE_OFFSET: "+08:00" },
        topics,
        search: async ({ query }) => {
          if (query === "broken") throw new Error("temporary search failure");
          return { logId: "ok", resultCount: 0, timeCostMs: 10, results: [] };
        },
      },
    );
    expect(partial.warnings).toEqual(["科技新闻：1 个查询暂不可用"]);

    await expect(
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
    ).rejects.toThrow(/all.*search/i);
  });
});

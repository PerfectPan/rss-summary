import { describe, expect, it } from "vite-plus/test";

import type { SelectedNewsStory } from "../../src/domain/news.js";
import { renderNewsBrief } from "../../src/presentation/news-render.js";

describe("presentation/news-render", () => {
  it("renders noon edition headers and omits empty topic sections", () => {
    const stories: SelectedNewsStory[] = [
      {
        id: "s1",
        title: "Headline",
        canonicalUrl: "https://example.com/a",
        summary: "Body sentence one. Body sentence two.",
        siteName: "Example",
        publishTime: "2026-07-29T09:00:00+08:00",
        rankScore: 1,
        authInfoLevel: 2,
        topicIds: ["technology"],
        topicLabels: ["科技新闻"],
        queries: ["AI"],
        queryHits: 1,
        score: 100,
        selectedTopicId: "technology",
      },
    ];

    const markdown = renderNewsBrief({
      day: "2026-07-29",
      edition: "noon",
      generatedAt: "2026-07-29T04:30:00.000Z",
      stories,
      topics: [
        {
          id: "technology",
          label: "科技新闻",
          enabled: true,
          sourcePolicy: "authoritative",
          maxItems: 3,
          queries: ["AI"],
        },
        {
          id: "empty",
          label: "空主题",
          enabled: true,
          sourcePolicy: "authoritative",
          maxItems: 3,
          queries: ["x"],
        },
      ],
      warnings: ["某源：1 个查询暂不可用"],
      windowLabel: "00:00–12:30",
    });

    expect(markdown).toContain("# 午间热点 · 2026-07-29");
    expect(markdown).toContain("Headline");
    expect(markdown).not.toContain("空主题");
    expect(markdown).toContain("数据源状态：某源：1 个查询暂不可用");
  });
});

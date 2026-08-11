import { describe, expect, it } from "vite-plus/test";

import { renderDailyAiDigest } from "../../src/presentation/daily-ai-render.js";

describe("Daily AI digest renderer", () => {
  it("renders a readable categorized golden with numbered source links", () => {
    const markdown = renderDailyAiDigest({
      day: "2026-08-10",
      items: [
        {
          category: "开发生态",
          headline: "OpenAI 发布 Codex 2.0，工具调用延迟降低 30%",
          refs: ["s1"],
        },
      ],
      evidence: [
        {
          id: "s1",
          title: "Codex 2.0",
          url: "https://openai.com/news/codex-2",
          publishedAt: "2026-08-10T03:00:00Z",
          excerpt: "release",
          tier: "official",
          sourceName: "OpenAI",
          topicId: "developer-tools",
        },
      ],
      warnings: [],
    });
    expect(markdown).toMatchInlineSnapshot(`
      "# Daily AI Digest · 2026-08-10

      1 条可信动态 · 来源可追溯 · 质量不足不凑数

      ## 开发生态

      1. OpenAI 发布 Codex 2.0，工具调用延迟降低 30% [1]

      ## 来源

      [1] [OpenAI · Codex 2.0](https://openai.com/news/codex-2)"
    `);
  });

  it("keeps a full six-section briefing scannable with global source numbering", () => {
    const categories = [
      "概览/要闻",
      "模型发布",
      "开发生态",
      "产品应用",
      "行业动态",
      "技术与洞察",
    ] as const;
    const items = categories.flatMap((category, categoryIndex) =>
      [0, 1].map((itemIndex) => ({
        category,
        headline: `OpenAI 发布第 ${categoryIndex * 2 + itemIndex + 1} 项可信 AI 更新`,
        refs: [`s${categoryIndex * 2 + itemIndex + 1}`],
      })),
    );
    const evidence = items.map((item, index) => ({
      id: item.refs[0]!,
      title: item.headline,
      url: `https://openai.com/news/${index + 1}`,
      publishedAt: "2026-08-10T03:00:00Z",
      excerpt: item.headline,
      tier: "official" as const,
      sourceName: "OpenAI",
    }));

    const markdown = renderDailyAiDigest({ day: "2026-08-10", items, evidence, warnings: [] });

    expect(markdown).toContain("12 条可信动态");
    categories.forEach((category) => expect(markdown).toContain(`## ${category}`));
    expect(markdown.match(/^\d+\. /gmu)).toHaveLength(12);
    expect(markdown.match(/^\[\d+\] \[/gmu)).toHaveLength(12);
  });
});

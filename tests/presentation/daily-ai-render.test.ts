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
});

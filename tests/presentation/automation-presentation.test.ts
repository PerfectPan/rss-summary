import { describe, expect, it } from "vite-plus/test";

import { createRssAutomationPresentation } from "../../src/presentation/automation-presentation.js";

describe("rss Automation presentation", () => {
  it("preserves Daily AI categories and turns inline badges into sources", () => {
    const presentation = createRssAutomationPresentation(`# Daily AI Digest · 2026-08-13

23 条可信动态 · 来源可追溯 · 质量不足不凑数

## 模型发布

1. DeepSeek-V4-Pro 正式版 API 上线 [↗ #1](https://api.example.test/deepseek)
2. Qwen 发布新权重 [↗ #2](https://qwen.example.test/release) [↗ #3](https://hf.example.test/qwen)
`);

    expect(presentation).toMatchObject({
      kind: "generic",
      meta: ["23 条可信动态 · 来源可追溯 · 质量不足不凑数"],
      schemaVersion: 1,
      sections: [
        {
          title: "模型发布",
          items: [
            {
              headline: "DeepSeek-V4-Pro 正式版 API 上线",
              sources: [{ label: "api.example.test", url: "https://api.example.test/deepseek" }],
            },
            { headline: "Qwen 发布新权重", sources: expect.any(Array) },
          ],
        },
      ],
      title: "Daily AI Digest · 2026-08-13",
    });
    expect(presentation.sections[0]?.items[1]?.sources).toHaveLength(2);
  });

  it("normalizes news cards and subscription summaries into the same IR", () => {
    const news = createRssAutomationPresentation(`# 午间热点 · 2026-08-13

2 条重要动态 · 08:00–12:30

**🤖 AI 与 Agent · 1**

**1. [Cloudflare 确认事故源于内部配置失误](https://example.test/cloudflare)**
不是网络攻击，服务已经恢复。
Cloudflare · 11:20
`);
    const subscriptions = createRssAutomationPresentation(`# 我的订阅 · 2026-08-13

2 条更新 · GitHub Home + 个人博客

**重点摘要**

**[MiniMax-AI/MiniMax-H3](https://github.com/MiniMax-AI/MiniMax-H3)**
新模型仓库。
来源：GitHub Home

**其他更新**

- 发布了「Deno 2.4」。[个人博客 ↗](https://deno.example.test/v2.4)
`);

    expect(news.sections[0]?.items[0]).toMatchObject({
      headline: "Cloudflare 确认事故源于内部配置失误",
      note: "不是网络攻击，服务已经恢复。 · Cloudflare · 11:20",
      sources: [{ url: "https://example.test/cloudflare" }],
    });
    expect(news.sections[0]?.title).toBe("AI 与 Agent");
    expect(subscriptions.sections[0]?.items[0]).toMatchObject({
      headline: "MiniMax-AI/MiniMax-H3",
      note: "新模型仓库。",
      sources: [{ label: "GitHub Home" }],
    });
    expect(subscriptions.sections[1]?.items[0]).toMatchObject({
      headline: "发布了「Deno 2.4」。",
      sources: [{ label: "个人博客" }],
    });
    expect(subscriptions.kind).toBe("generic");
  });

  it("keeps the semantic source label out of the item note", () => {
    const presentation = createRssAutomationPresentation(
      `# 我的订阅 · 2026-08-13

2 条更新 · GitHub Home

**重点摘要**

**[owner/repo](https://github.com/owner/repo)**
项目说明。
来源：GitHub Home
`,
      "subscriptions",
    );

    expect(presentation.kind).toBe("subscriptions");
    expect(presentation.sections[0]?.items[0]).toMatchObject({
      note: "项目说明。",
      sources: [{ label: "GitHub Home", url: "https://github.com/owner/repo" }],
    });
  });
});

import { describe, expect, it } from "vite-plus/test";

import { decodeViewFromMarkdown } from "./view-decode.js";

describe("app/render/view-decode", () => {
  it("decodes the canonical document grammar back into a view", () => {
    const view = decodeViewFromMarkdown(`# 我的订阅 · 2026-08-13

2 条更新 · GitHub Home + 个人博客

**重点摘要**

**[owner/repo](https://github.com/owner/repo)**
⭐ 12.3k · TypeScript
新模型仓库。
来源：GitHub Home

**其他更新**

- 发布了「Deno 2.4」。[个人博客 ↗](https://deno.example.test/v2.4)

另有 1 篇论文等待原文核验，暂不直接推送。
`);

    expect(view.title).toBe("我的订阅 · 2026-08-13");
    expect(view.meta).toEqual(["2 条更新 · GitHub Home + 个人博客"]);
    expect(view.sections).toHaveLength(2);
    expect(view.sections[0]).toMatchObject({ heading: "重点摘要", style: "strong" });
    expect(view.sections[0]?.items[0]).toMatchObject({
      shape: "featured",
      headline: "owner/repo",
      links: [{ text: "owner/repo", url: "https://github.com/owner/repo" }],
      notes: ["⭐ 12.3k · TypeScript", "新模型仓库。"],
      sourceLabel: "GitHub Home",
    });
    expect(view.sections[1]?.items[0]).toMatchObject({
      shape: "bullet",
      headline: "发布了「Deno 2.4」。",
      links: [{ text: "个人博客 ↗", url: "https://deno.example.test/v2.4" }],
    });
    // Plain trailing notices are resolved like the legacy parser: with an
    // active item they join its notes instead of a trailing entry.
    expect(view.sections[1]?.items[0]?.notes).toEqual([
      "另有 1 篇论文等待原文核验，暂不直接推送。",
    ]);
    expect(view.trailing).toEqual([]);
  });

  it("keeps heading sections, numbered badges, and the status footnote", () => {
    const view = decodeViewFromMarkdown(`# Daily AI Digest · 2026-08-16

1 条 AI 动态 · 来源可追溯

## 模型发布

1. Claude 更新了工具链 [↗ #1 · X（Grok 整理）](https://x.com/claudedevs/status/1)

数据源状态：X 资讯经 Grok 整理
`);

    expect(view.sections[0]).toMatchObject({ heading: "模型发布", style: "atx" });
    expect(view.sections[0]?.items[0]).toMatchObject({
      shape: "numbered",
      number: 1,
      headline: "Claude 更新了工具链",
      links: [{ text: "↗ #1 · X（Grok 整理）", url: "https://x.com/claudedevs/status/1" }],
    });
    expect(view.trailing).toEqual([{ kind: "status", text: "数据源状态：X 资讯经 Grok 整理" }]);
  });

  it("falls back to the generic title and a 动态 section for headingless text", () => {
    const view = decodeViewFromMarkdown(
      "一条没有标题的说明\n\n- 列表项 [来源 ↗](https://example.com/a)",
    );
    expect(view.title).toBe("Rivus 自动简报");
    expect(view.meta).toEqual(["一条没有标题的说明"]);
    expect(view.sections[0]?.heading).toBe("动态");
  });
});

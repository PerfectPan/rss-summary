import { describe, expect, it } from "vite-plus/test";

import { renderAutomationPresentation } from "../../../src/app/render/automation.js";
import type { ViewDocument } from "../../../src/app/render/view.js";

describe("app/render/automation presentation", () => {
  it("projects sections, items, notes, and sources from the view", () => {
    const view: ViewDocument = {
      title: "Daily AI Digest · 2026-08-13",
      meta: ["23 条可信动态 · 来源可追溯 · 质量不足不凑数"],
      sections: [
        {
          heading: "模型发布",
          style: "atx",
          items: [
            {
              shape: "numbered",
              number: 1,
              headline: "DeepSeek-V4-Pro 正式版 API 上线",
              links: [{ text: "↗ #1", url: "https://api.example.test/deepseek" }],
              notes: [],
            },
            {
              shape: "numbered",
              number: 2,
              headline: "Codex CLI 发布新版本",
              links: [
                { text: "↗ #2", url: "https://github.com/openai/codex/releases/tag/v1" },
                { text: "↗ #3", url: "https://github.com/openai/codex/commit/abc" },
                { text: "↗ #4 · X（Grok 整理）", url: "https://x.com/openai/codex/1" },
              ],
              notes: [],
            },
          ],
        },
      ],
      trailing: [],
      variant: "daily-ai",
    };

    expect(renderAutomationPresentation(view, "daily-ai")).toEqual({
      kind: "daily-ai",
      meta: ["23 条可信动态 · 来源可追溯 · 质量不足不凑数"],
      schemaVersion: 1,
      sections: [
        {
          id: "1-models",
          items: [
            {
              headline: "DeepSeek-V4-Pro 正式版 API 上线",
              sources: [{ label: "api.example.test", url: "https://api.example.test/deepseek" }],
            },
            {
              headline: "Codex CLI 发布新版本",
              sources: [
                { label: "GitHub", url: "https://github.com/openai/codex/releases/tag/v1" },
                { label: "↗ #4 · X（Grok 整理）", url: "https://x.com/openai/codex/1" },
              ],
            },
          ],
          title: "模型发布",
        },
      ],
      title: "Daily AI Digest · 2026-08-13",
    });
  });

  it("normalizes strong topic headings and joins card notes", () => {
    const view: ViewDocument = {
      title: "午间热点 · 2026-08-13",
      meta: ["2 条重要动态 · 08:00–12:30"],
      sections: [
        {
          heading: "🤖 AI 与 Agent · 1",
          style: "strong",
          items: [
            {
              shape: "card",
              number: 1,
              headline: "Cloudflare 确认事故源于内部配置失误",
              links: [
                {
                  text: "Cloudflare 确认事故源于内部配置失误",
                  url: "https://example.test/cloudflare",
                },
              ],
              notes: ["不是网络攻击，服务已经恢复。", "Cloudflare · 11:20"],
            },
          ],
        },
      ],
      trailing: [{ kind: "status", text: "数据源状态：部分来源尚未完成" }],
      variant: "news",
    };

    const presentation = renderAutomationPresentation(view, "news");
    expect(presentation.sections[0]).toMatchObject({ id: "1-ai-agent", title: "AI 与 Agent" });
    expect(presentation.sections[0]?.items[0]).toMatchObject({
      headline: "Cloudflare 确认事故源于内部配置失误",
      note: "不是网络攻击，服务已经恢复。 · Cloudflare · 11:20",
      sources: [{ label: "example.test", url: "https://example.test/cloudflare" }],
    });
    expect(presentation.footnote).toBe("数据源状态：部分来源尚未完成");
  });

  it("relabels the last source from the featured item's source label", () => {
    const view: ViewDocument = {
      title: "我的订阅 · 2026-08-13",
      meta: ["1 条更新 · GitHub Home"],
      sections: [
        {
          heading: "重点摘要",
          style: "strong",
          items: [
            {
              shape: "featured",
              headline: "owner/repo",
              links: [{ text: "owner/repo", url: "https://github.com/owner/repo" }],
              notes: ["⭐ 12.3k · TypeScript", "项目说明。"],
              sourceLabel: "GitHub Home",
            },
          ],
        },
      ],
      trailing: [],
      variant: "brief",
    };

    expect(renderAutomationPresentation(view, "subscriptions").sections[0]?.items[0]).toMatchObject(
      {
        headline: "owner/repo",
        note: "⭐ 12.3k · TypeScript · 项目说明。",
        sources: [{ label: "GitHub Home", url: "https://github.com/owner/repo" }],
      },
    );
  });

  it("routes trailing plain notices into meta without items and the last note with items", () => {
    const empty: ViewDocument = {
      title: "我的订阅 · 2026-08-15",
      meta: ["0 条更新 · 个人博客 · 2026-08-15 +08:00"],
      sections: [],
      trailing: [{ kind: "plain", text: "今天没有新的订阅内容。" }],
      variant: "brief",
    };
    expect(renderAutomationPresentation(empty, "subscriptions").meta).toEqual([
      "0 条更新 · 个人博客 · 2026-08-15 +08:00",
      "今天没有新的订阅内容。",
    ]);

    const withItems: ViewDocument = {
      title: "我的订阅 · 2026-08-15",
      meta: ["1 条更新 · 个人博客"],
      sections: [
        {
          heading: "其他更新",
          style: "strong",
          items: [
            {
              shape: "bullet",
              headline: "发布了「Deno 2.4」。",
              links: [{ text: "个人博客 ↗", url: "https://deno.example.test/v2.4" }],
              notes: [],
            },
          ],
        },
      ],
      trailing: [{ kind: "plain", text: "另有 1 篇论文等待原文核验，暂不直接推送。" }],
      variant: "brief",
    };
    const item = renderAutomationPresentation(withItems, "subscriptions").sections[0]?.items[0];
    expect(item?.note).toBe("另有 1 篇论文等待原文核验，暂不直接推送。");
    expect(item?.sources).toEqual([{ label: "个人博客", url: "https://deno.example.test/v2.4" }]);
  });
});

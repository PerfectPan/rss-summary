import { describe, expect, it } from "vite-plus/test";

import { extractArticle } from "./mapper.js";

describe("html article extraction", () => {
  it("extracts the content column instead of navigation chrome", () => {
    const result = extractArticle(
      `<html><head><title>Daily report</title></head><body>
        <nav>Older reports 2026 2025 2024</nav>
        <main class="layout"><main class="article"><h1>AI 日报</h1><p>今日摘要包含机器人仿真引擎。</p><h2>产品更新</h2><p>系统支持一小时无人干预运行。</p></main></main>
        <footer>Privacy Terms</footer>
      </body></html>`,
      "https://example.com/daily",
    );

    expect(result.title).toBe("AI 日报");
    expect(result.content).toContain("今日摘要包含机器人仿真引擎");
    expect(result.content).toContain("系统支持一小时无人干预运行");
    expect(result.content).not.toContain("Older reports");
    expect(result.content).not.toContain("Privacy Terms");
  });

  it("removes page-level promotion from a readable article body", () => {
    const result = extractArticle(
      `<article><h1>AI 日报</h1><p>AI资讯 | 每日早读 | 全网数据聚合 | 访问网页版↗️</p><p>机器人仿真引擎支持一小时无人干预运行。</p><p>AI资讯日报多渠道</p><p>💬 微信公众号</p><p>公众号：何夕2077</p></article>`,
      "https://example.com/daily",
    );

    expect(result.content).toContain("机器人仿真引擎支持一小时无人干预运行");
    expect(result.content).not.toContain("每日早读");
    expect(result.content).not.toContain("何夕2077");
  });

  it("keeps readable fallback text on pages without an article root", () => {
    const result = extractArticle(
      `<html><head><title>Note</title><script>window.tracking = true;</script></head>
      <body><nav>Navigation</nav><div>A useful note about TypeScript.</div><footer>Privacy</footer></body></html>`,
      "https://example.com/note",
    );

    expect(result).toEqual({
      title: "Note",
      content: "Note A useful note about TypeScript.",
    });
  });

  it("scores the richer article root above a short sibling", () => {
    const result = extractArticle(
      "<article><h1>Short</h1><p>Tiny.</p></article><article><h1>Title</h1><p>A longer grounded paragraph for the selected root.</p><p>Another paragraph increases the score.</p></article>",
      "https://example.com/scored",
    );

    expect(result.content).toContain("Title");
    expect(result.content).toContain("A longer grounded paragraph for the selected root.");
    expect(result.content).not.toContain("Tiny.");
  });
});

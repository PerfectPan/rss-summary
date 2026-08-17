import { describe, expect, it } from "vite-plus/test";

import {
  ArticleResearchClient,
  extractArticle,
} from "../../src/infrastructure/article-research.js";

describe("article research", () => {
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

  it("returns structured failure for a private URL without making a request", async () => {
    let calls = 0;
    const client = new ArticleResearchClient({
      fetch: async () => {
        calls += 1;
        return new Response("never");
      },
      now: () => new Date("2026-08-17T01:00:00.000Z"),
    });

    await expect(
      client.research({ ref: "article:1", url: "http://127.0.0.1/admin" }),
    ).resolves.toEqual({
      error: "article URL points to a private or local host",
      ref: "article:1",
      retrievedAt: "2026-08-17T01:00:00.000Z",
      status: "failed",
      url: "http://127.0.0.1/admin",
    });
    expect(calls).toBe(0);
  });

  it("fetches bounded HTML and records the final URL", async () => {
    const client = new ArticleResearchClient({
      fetch: async (url, init) => {
        expect(String(url)).toBe("https://example.com/article");
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return new Response(
          `<article><h1>Useful article</h1><p>${"Grounded content. ".repeat(10)}</p></article>`,
          { headers: { "content-type": "text/html" }, status: 200 },
        );
      },
      now: () => new Date("2026-08-17T01:00:00.000Z"),
    });

    await expect(
      client.research({ ref: "article:1", url: "https://example.com/article" }),
    ).resolves.toMatchObject({
      fetchedUrl: "https://example.com/article",
      ref: "article:1",
      status: "ok",
      title: "Useful article",
      url: "https://example.com/article",
    });
  });
});

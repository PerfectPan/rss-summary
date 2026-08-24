import { describe, expect, it } from "vite-plus/test";

import { BrowserArticleResearchClient } from "../../src/infrastructure/browser-article-research.js";

describe("browser article research", () => {
  it("extracts rendered article HTML through the injected page fetcher", async () => {
    const client = new BrowserArticleResearchClient({
      fetchPage: async ({ url }) => ({
        html: `<html><head><title>Rendered article</title></head><body><nav>Menu</nav><article><h1>Rendered article</h1><p>${"Browser-rendered content. ".repeat(8)}</p></article></body></html>`,
        url,
      }),
    });

    await expect(
      client.research({ ref: "article:1", url: "https://example.com/article" }),
    ).resolves.toMatchObject({
      ref: "article:1",
      method: "browser",
      status: "ok",
      title: "Rendered article",
      url: "https://example.com/article",
    });
  });

  it("rejects private final redirects", async () => {
    const client = new BrowserArticleResearchClient({
      fetchPage: async () => ({
        html: "<article>not used</article>",
        url: "http://127.0.0.1/admin",
      }),
    });

    await expect(
      client.research({ ref: "article:1", url: "https://example.com/article" }),
    ).resolves.toMatchObject({
      error: "article URL points to a private or local host",
      ref: "article:1",
      status: "failed",
    });
  });
});

import { describe, expect, it } from "vite-plus/test";

import { extractArticle } from "../../../../src/reading/domain/document/adapters/html-article.js";
import { BrowserArticleResearchClient } from "../../../../src/reading/infra/adapters/browser-reader.js";

describe("browser article research", () => {
  it("extracts rendered article HTML through the injected page fetcher", async () => {
    const client = new BrowserArticleResearchClient({
      extract: extractArticle,
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
      extract: extractArticle,
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

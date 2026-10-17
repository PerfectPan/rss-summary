import { describe, expect, it } from "vite-plus/test";

import { extractArticle } from "../../../../src/reading/domain/document/adapters/html-article.js";
import { ArticleResearchClient } from "../../../../src/reading/infra/adapters/http-reader.js";

describe("article research", () => {
  it("returns structured failure for a private URL without making a request", async () => {
    let calls = 0;
    const client = new ArticleResearchClient({
      extract: extractArticle,
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
      method: "http",
      ref: "article:1",
      retrievedAt: "2026-08-17T01:00:00.000Z",
      status: "failed",
      url: "http://127.0.0.1/admin",
    });
    expect(calls).toBe(0);
  });

  it("rejects a video page whose apparent body is only scripts and page chrome", async () => {
    const client = new ArticleResearchClient({
      extract: extractArticle,
      fetch: async () =>
        new Response(
          `<html><head><title>Video</title><script>${"window.playerData = {};".repeat(20)}</script>
          <style>${".player { display: block; }".repeat(20)}</style></head>
          <body><nav>${"Sign in Browse Videos ".repeat(20)}</nav><video></video></body></html>`,
          { headers: { "content-type": "text/html" } },
        ),
    });

    await expect(
      client.research({ ref: "video:1", url: "https://example.com/player" }),
    ).resolves.toMatchObject({
      status: "failed",
      error: "article body was too short after extraction",
    });
  });

  it.each([
    "https://www.youtube.com/watch?is=tracking&v=example&feature=youtu.be",
    "https://youtu.be/example",
    "https://m.youtube.com/shorts/example",
    "https://www.youtube.com/live/example",
    "https://www.youtube-nocookie.com/embed/example",
    "https://video.twimg.com/amplify_video/123/vid/avc1/1920x1080/example.mp4?tag=1",
  ])("requires transcript evidence for a known video URL: %s", async (url) => {
    const client = new ArticleResearchClient({
      extract: extractArticle,
      fetch: async () => {
        throw new Error("video URL should be rejected before fetching");
      },
    });

    await expect(client.research({ ref: "video:1", url })).resolves.toMatchObject({
      status: "failed",
      error: "video research requires captions or a transcript",
    });
  });

  it("fetches bounded HTML and records the final URL", async () => {
    const client = new ArticleResearchClient({
      extract: extractArticle,
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

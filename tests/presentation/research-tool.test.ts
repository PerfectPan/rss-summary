import { describe, expect, it, vi } from "vite-plus/test";

import { createArticleResearchExecutor } from "../../src/presentation/research-tool.js";

describe("article research Tool", () => {
  it("preserves visual provenance and material links in the scheduled research result", async () => {
    const url = "https://www.youtube.com/watch?v=example";
    const execute = createArticleResearchExecutor({
      videoClient: {
        research: async ({ ref }) => ({
          ref,
          url,
          fetchedUrl: url,
          status: "ok",
          method: "captions",
          retrievedAt: "2026-10-09T12:00:00Z",
          title: "Demo",
          content: "视频音频与已经核验的画面证据。".repeat(10),
          visuals: {
            status: "analyzed",
            frames: [
              {
                index: 1,
                timestampSeconds: 59,
                imagePath: "/generated/frame.png",
                visualText: "画面显示 SQLite 存储初始化代码。",
              },
            ],
          },
          materials: {
            transcriptPath: "/generated/transcript.txt",
            manifestPath: "/generated/research.json",
          },
        }),
      },
    });
    expect(await execute({ ref: "video:1", url })).toMatchObject({
      tool: "article-research",
      visuals: { status: "analyzed" },
      materials: { transcriptPath: "/generated/transcript.txt" },
    });
  });

  it("validates the Agent request and returns structured research evidence", async () => {
    const research = vi.fn(async ({ ref, url }: { ref: string; url: string }) => ({
      content: "A sufficiently long article body for a grounded summary.",
      fetchedUrl: url,
      ref,
      retrievedAt: "2026-08-17T01:00:00.000Z",
      status: "ok" as const,
      title: "Article title",
      url,
    }));
    const execute = createArticleResearchExecutor({ client: { research } });

    await expect(
      execute({ ref: "article:1", url: "https://example.com/article" }),
    ).resolves.toMatchObject({
      ref: "article:1",
      status: "ok",
      title: "Article title",
      tool: "article-research",
    });
    expect(research).toHaveBeenCalledWith({ ref: "article:1", url: "https://example.com/article" });
  });

  it("rejects an incomplete request before invoking the client", async () => {
    const research = vi.fn();
    const execute = createArticleResearchExecutor({ client: { research } });

    await expect(execute({ url: "https://example.com/article" })).rejects.toThrow(
      "Article research requires ref",
    );
    expect(research).not.toHaveBeenCalled();
  });

  it.each(["auto", "browser", "http"])(
    "routes videos to transcript research instead of browser, HTTP or GLM in %s mode",
    async (mode) => {
      const research = vi.fn();
      const read = vi.fn();
      const video = vi.fn(async ({ ref, url }: { ref: string; url: string }) => ({
        ref,
        url,
        fetchedUrl: url,
        title: "Video",
        retrievedAt: "2026-10-07T15:00:00Z",
        content: "Verified captions. ".repeat(10),
        method: "captions" as const,
        status: "ok" as const,
      }));
      const execute = createArticleResearchExecutor({
        env: { RSS_ARTICLE_GLM_FALLBACK: "true" },
        browserClient: { research },
        client: { research },
        glmClient: { read },
        videoClient: { research: video },
      });

      await expect(
        execute({ mode, ref: "video:1", url: "https://www.youtube.com/watch?v=example" }),
      ).resolves.toMatchObject({
        status: "ok",
        method: "captions",
        tool: "article-research",
      });
      expect(research).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
      expect(video).toHaveBeenCalledOnce();
    },
  );

  it("uses browser research first in auto mode and skips HTTP on success", async () => {
    const browser = vi.fn(async ({ ref, url }: { ref: string; url: string }) => ({
      content: "Rendered browser content with enough detail for a grounded single-item summary.",
      fetchedUrl: url,
      ref,
      retrievedAt: "2026-08-17T01:00:00.000Z",
      status: "ok" as const,
      title: "Rendered title",
      url,
    }));
    const http = vi.fn();
    const execute = createArticleResearchExecutor({
      browserClient: { research: browser },
      client: { research: http },
    });

    await expect(
      execute({ mode: "auto", ref: "article:1", url: "https://example.com/article" }),
    ).resolves.toMatchObject({ status: "ok", title: "Rendered title" });
    expect(browser).toHaveBeenCalledWith({ ref: "article:1", url: "https://example.com/article" });
    expect(http).not.toHaveBeenCalled();
  });

  it("falls back to HTTP when browser research fails in auto mode", async () => {
    const browser = vi.fn(async () => ({
      error: "browser timeout",
      ref: "article:1",
      retrievedAt: "2026-08-17T01:00:00.000Z",
      status: "failed" as const,
      url: "https://example.com/article",
    }));
    const http = vi.fn(async ({ ref, url }: { ref: string; url: string }) => ({
      content: "HTTP fallback content with enough detail for a grounded single-item summary.",
      fetchedUrl: url,
      ref,
      retrievedAt: "2026-08-17T01:00:00.000Z",
      status: "ok" as const,
      title: "HTTP title",
      url,
    }));
    const execute = createArticleResearchExecutor({
      browserClient: { research: browser },
      client: { research: http },
    });

    await expect(
      execute({ mode: "auto", ref: "article:1", url: "https://example.com/article" }),
    ).resolves.toMatchObject({ status: "ok", title: "HTTP title" });
    expect(http).toHaveBeenCalledWith({ ref: "article:1", url: "https://example.com/article" });
  });
});

it("uses opt-in GLM Reader only after browser and HTTP failures", async () => {
  const failed = {
    error: "unavailable",
    ref: "article:1",
    retrievedAt: "2026-09-29T01:00:00Z",
    status: "failed" as const,
    url: "https://example.com/article",
  };
  const research = vi.fn(async () => failed);
  const read = vi.fn(async () => ({
    title: "Article",
    url: failed.url,
    content: "Source content. ".repeat(10),
    truncated: false,
  }));
  const execute = createArticleResearchExecutor({
    env: { RSS_ARTICLE_GLM_FALLBACK: "true" },
    client: { research },
    browserClient: { research },
    glmClient: { read },
  });
  expect(await execute({ ref: failed.ref, url: failed.url })).toMatchObject({
    status: "ok",
    method: "glm",
    tool: "article-research",
  });
  expect(read).toHaveBeenCalledTimes(1);
  read.mockClear();
  await execute({ ref: failed.ref, url: failed.url, mode: "http" });
  expect(read).not.toHaveBeenCalled();
  const disabled = createArticleResearchExecutor({
    env: {},
    client: { research },
    browserClient: { research },
    glmClient: { read },
  });
  expect(await disabled({ ref: failed.ref, url: failed.url })).toMatchObject({ status: "failed" });
  expect(read).not.toHaveBeenCalled();
});

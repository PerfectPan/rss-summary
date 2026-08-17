import { describe, expect, it, vi } from "vite-plus/test";

import { createArticleResearchExecutor } from "../../src/presentation/research-tool.js";

describe("article research Tool", () => {
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

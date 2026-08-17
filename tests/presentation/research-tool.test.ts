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
});

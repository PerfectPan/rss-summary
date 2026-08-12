import { describe, expect, it } from "vite-plus/test";

import { collectIndustrySources } from "../../src/infrastructure/industry-source-batch.js";

describe("industry source collection", () => {
  it("isolates RSS and web page source failures", async () => {
    const collection = await collectIndustrySources(
      {
        rss: {
          getFeedEvents: async (feed) => [
            {
              id: `rss:${feed.url}:1`,
              type: "article",
              source: "rss",
              actor: feed.name,
              repo: `rss:${feed.url}:1`,
              createdAt: "2026-08-12T00:00:00Z",
            },
          ],
        },
        page: { getEvents: async () => Promise.reject(new Error("blocked")) },
      },
      [
        { name: "Working RSS", url: "https://example.com/feed.xml", tags: [] },
        {
          type: "page",
          name: "Broken News",
          url: "https://vendor.example/news",
          pathPrefixes: ["/news/"],
          tags: [],
        },
      ],
    );

    expect(collection.events).toHaveLength(1);
    expect(collection.sources).toEqual([
      expect.objectContaining({ name: "Working RSS", kind: "rss", status: "ok" }),
      expect.objectContaining({
        name: "Broken News",
        kind: "web-page",
        status: "failed",
        error: "blocked",
      }),
    ]);
  });
});

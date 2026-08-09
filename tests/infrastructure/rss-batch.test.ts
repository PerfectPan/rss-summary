import { describe, expect, it } from "vite-plus/test";

import { collectRssFeeds } from "../../src/infrastructure/rss-batch.js";

describe("RSS batch collection", () => {
  it("keeps successful feeds and audits failures", async () => {
    const collection = await collectRssFeeds(
      {
        getFeedEvents: async (feed) => {
          if (feed.name === "Broken") throw new Error("timeout");
          return [
            {
              id: "rss:ok:1",
              type: "article",
              source: "rss",
              actor: feed.name,
              repo: "rss:https://example.com/post",
              createdAt: "2026-08-09T00:00:00.000Z",
            },
          ];
        },
      },
      [
        { name: "Good", url: "https://example.com/good.xml", tags: [] },
        { name: "Broken", url: "https://example.com/broken.xml", tags: [] },
      ],
    );

    expect(collection.events).toHaveLength(1);
    expect(collection.sources).toEqual([
      expect.objectContaining({ name: "Good", status: "ok", itemCount: 1 }),
      expect.objectContaining({ name: "Broken", status: "failed", error: "timeout" }),
    ]);
  });
});

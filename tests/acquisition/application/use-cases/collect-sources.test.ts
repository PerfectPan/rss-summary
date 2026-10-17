import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { RssFeed, WebPage } from "../../../../src/acquisition/application/ports.js";
import { acquireActivityCard } from "../../../../src/acquisition/domain/item/adapters/scoring-trace.js";
import {
  collectIndustrySources,
  collectRssFeeds,
} from "../../../../src/acquisition/application/use-cases/collect-sources.js";

describe("source collection", () => {
  it("keeps successful feeds and audits failures", async () => {
    const rss = Layer.succeed(RssFeed, {
      getFeedEvents: (feed) =>
        feed.name === "Broken"
          ? Effect.fail(new Error("timeout"))
          : Effect.succeed([
              acquireActivityCard({
                id: "rss:ok:1",
                type: "article" as const,
                source: "rss" as const,
                actor: feed.name,
                repo: "rss:https://example.com/post",
                createdAt: "2026-08-09T00:00:00.000Z",
              }),
            ]),
    });
    const collection = await Effect.runPromise(
      Effect.provide(
        collectRssFeeds([
          { name: "Good", url: "https://example.com/good.xml", tags: [] },
          { name: "Broken", url: "https://example.com/broken.xml", tags: [] },
        ]),
        rss,
      ),
    );

    expect(collection.acquired).toHaveLength(1);
    expect(collection.sources).toEqual([
      expect.objectContaining({ name: "Good", status: "ok", itemCount: 1 }),
      expect.objectContaining({ name: "Broken", status: "failed", error: "timeout" }),
    ]);
    expect(Object.keys(collection.sources[0] ?? {})).toEqual([
      "id",
      "kind",
      "name",
      "url",
      "status",
      "itemCount",
    ]);
    expect(Object.keys(collection.sources[1] ?? {})).toEqual([
      "id",
      "kind",
      "name",
      "url",
      "status",
      "itemCount",
      "error",
    ]);
  });

  it("isolates RSS and web page source failures", async () => {
    const layer = Layer.mergeAll(
      Layer.succeed(RssFeed, {
        getFeedEvents: (feed) =>
          Effect.succeed([
            acquireActivityCard({
              id: `rss:${feed.url}:1`,
              type: "article" as const,
              source: "rss" as const,
              actor: feed.name,
              repo: `rss:${feed.url}:1`,
              createdAt: "2026-08-12T00:00:00Z",
            }),
          ]),
      }),
      Layer.succeed(WebPage, {
        getEvents: () => Effect.fail(new Error("blocked")),
      }),
    );
    const collection = await Effect.runPromise(
      Effect.provide(
        collectIndustrySources([
          { name: "Working RSS", url: "https://example.com/feed.xml", tags: [] },
          {
            type: "page",
            name: "Broken News",
            url: "https://vendor.example/news",
            pathPrefixes: ["/news/"],
            tags: [],
          },
        ]),
        layer,
      ),
    );

    expect(collection.acquired).toHaveLength(1);
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

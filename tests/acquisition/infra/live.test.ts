import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  GitHubActivity,
  RssFeed,
  SourceCatalogStore,
} from "../../../src/acquisition/application/ports.js";
import { AcquisitionLive } from "../../../src/acquisition/infra/live.js";

const xml = `<rss><channel><item><title>Note</title><link>https://example.com/note</link><description>Body</description></item></channel></rss>`;

describe("AcquisitionLive", () => {
  it("serves RSS events and an empty catalog through one layer", async () => {
    const fetchImpl: typeof fetch = async () => new Response(xml);
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const rss = yield* RssFeed;
          const store = yield* SourceCatalogStore;
          return {
            events: yield* rss.getFeedEvents({
              name: "Example",
              url: "https://example.com/feed.xml",
              tags: [],
            }),
            feeds: yield* store.loadFeeds("/tmp/rss-summary-p2a-missing-feeds.json"),
          };
        }),
        AcquisitionLive({ fetch: fetchImpl }),
      ),
    );
    expect(result.events.map((entry) => entry.card)).toEqual([
      expect.objectContaining({ title: "Note", source: "rss", type: "article" }),
    ]);
    expect(result.feeds).toEqual([]);
  });

  it("reports the historical missing storage-state error", async () => {
    await expect(
      Effect.runPromise(
        Effect.provide(
          Effect.gen(function* () {
            const github = yield* GitHubActivity;
            return yield* github.getHomeEvents();
          }),
          AcquisitionLive(),
        ),
      ),
    ).rejects.toThrow(
      "GitHub Home storage state not found: . Run 'rss-summary github-home login' first.",
    );
  });
});

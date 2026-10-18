import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { readFeedEvents } from "./rss-http.js";

const feed = {
  name: "Example",
  url: "https://example.com/feed.xml",
  tags: ["mcp"],
};

describe("RSS feed adapter", () => {
  it("fetches and parses a configured feed", async () => {
    const events = await Effect.runPromise(
      readFeedEvents(feed, {
        fetch: async (url) => {
          expect(String(url)).toBe("https://example.com/feed.xml");
          return new Response(
            `<rss><channel><item><title>Useful MCP note</title><link>https://example.com/mcp</link></item></channel></rss>`,
            { status: 200 },
          );
        },
      }),
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe("Useful MCP note");
  });

  it("passes an abort signal to feed fetches", async () => {
    let signal: AbortSignal | undefined;
    await Effect.runPromise(
      readFeedEvents(
        { name: "Slow Feed", url: "https://example.com/feed.xml", tags: [] },
        {
          fetch: async (_url, init) => {
            signal = init?.signal ?? undefined;
            return new Response("<rss><channel></channel></rss>", { status: 200 });
          },
        },
      ),
    );

    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("reports the feed status without retrying", async () => {
    let calls = 0;
    await expect(
      Effect.runPromise(
        readFeedEvents(feed, {
          fetch: async () => {
            calls += 1;
            return new Response("nope", { status: 503 });
          },
        }),
      ),
    ).rejects.toThrow("RSS feed Example returned 503");
    expect(calls).toBe(1);
  });
});

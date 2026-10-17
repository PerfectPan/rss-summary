import { describe, expect, it } from "vite-plus/test";

import { RssClient } from "../../../../src/acquisition/infra/adapters/rss-http.js";

describe("RssClient", () => {
  it("fetches and parses a configured feed", async () => {
    const client = new RssClient({
      fetch: async (url) => {
        expect(String(url)).toBe("https://example.com/feed.xml");
        return new Response(
          `<rss><channel><item><title>Useful MCP note</title><link>https://example.com/mcp</link></item></channel></rss>`,
          { status: 200 },
        );
      },
    });

    const events = await client.getFeedEvents({
      name: "Example",
      url: "https://example.com/feed.xml",
      tags: ["mcp"],
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe("Useful MCP note");
  });

  it("passes an abort signal to feed fetches", async () => {
    let signal: AbortSignal | undefined;
    const client = new RssClient({
      fetch: async (_url, init) => {
        signal = init?.signal ?? undefined;
        return new Response("<rss><channel></channel></rss>", { status: 200 });
      },
    });

    await client.getFeedEvents({
      name: "Slow Feed",
      url: "https://example.com/feed.xml",
      tags: [],
    });

    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("reports the feed status without retrying", async () => {
    let calls = 0;
    const client = new RssClient({
      fetch: async () => {
        calls += 1;
        return new Response("nope", { status: 503 });
      },
    });
    await expect(
      client.getFeedEvents({ name: "Example", url: "https://example.com/feed.xml", tags: [] }),
    ).rejects.toThrow("RSS feed Example returned 503");
    expect(calls).toBe(1);
  });
});

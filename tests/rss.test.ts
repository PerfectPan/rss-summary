import { describe, expect, it } from "vitest";

import { parseFeedXml, RssClient } from "../src/rss.js";

describe("RSS source", () => {
  it("parses RSS 2.0 items into activity cards", () => {
    const events = parseFeedXml(
      `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Deno Blog</title>
          <item>
            <title>Deno 2.4</title>
            <link>https://deno.com/blog/v2.4</link>
            <guid>deno-2.4</guid>
            <pubDate>Mon, 22 Jun 2026 08:00:00 GMT</pubDate>
            <description>Runtime updates for TypeScript and JavaScript.</description>
          </item>
        </channel>
      </rss>`,
      {
        name: "Deno Blog",
        url: "https://deno.com/feed",
        tags: ["deno", "runtime"],
      },
    );

    expect(events).toEqual([
      {
        id: "rss:https://deno.com/feed:deno-2.4",
        type: "article",
        source: "rss",
        actor: "Deno Blog",
        repo: "rss:https://deno.com/blog/v2.4",
        createdAt: "2026-06-22T08:00:00.000Z",
        action: "published",
        htmlUrl: "https://deno.com/blog/v2.4",
        title: "Deno 2.4",
        summary: "Runtime updates for TypeScript and JavaScript.",
        sourceName: "Deno Blog",
        sourceUrl: "https://deno.com/feed",
        tags: ["deno", "runtime"],
      },
    ]);
  });

  it("cleans HTML from feed summaries", () => {
    const events = parseFeedXml(
      `<rss><channel><item>
        <title>Agent note</title>
        <link>https://example.com/agent</link>
        <description><![CDATA[<p>Build <strong>useful</strong> agents.</p><p>The post appeared first.</p>]]></description>
      </item></channel></rss>`,
      {
        name: "Example",
        url: "https://example.com/feed",
        tags: ["agent"],
      },
    );

    expect(events[0]?.summary).toBe("Build useful agents. The post appeared first.");
  });

  it("parses Atom entries into activity cards", () => {
    const events = parseFeedXml(
      `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>OpenAI News</title>
        <entry>
          <id>tag:openai.com,2026:agents</id>
          <title>New agent tooling</title>
          <link href="https://openai.com/news/agents" />
          <updated>2026-06-22T09:10:00Z</updated>
          <summary>Better tools for coding agents.</summary>
        </entry>
      </feed>`,
      {
        name: "OpenAI News",
        url: "https://openai.com/news/rss.xml",
        tags: ["agent"],
      },
    );

    expect(events[0]).toMatchObject({
      id: "rss:https://openai.com/news/rss.xml:tag:openai.com,2026:agents",
      type: "article",
      source: "rss",
      actor: "OpenAI News",
      repo: "rss:https://openai.com/news/agents",
      htmlUrl: "https://openai.com/news/agents",
      title: "New agent tooling",
      summary: "Better tools for coding agents.",
      tags: ["agent"],
    });
  });

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
});

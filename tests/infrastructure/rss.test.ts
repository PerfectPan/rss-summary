import { describe, expect, it } from "vite-plus/test";

import { parseFeedXml, RssClient } from "../../src/infrastructure/rss.js";

describe("RSS source", () => {
  it("removes navigation and subscription boilerplate from summaries", () => {
    const [event] = parseFeedXml(
      `<rss><channel><item><title>2026-08-10日刊</title><link>https://example.com/daily</link><pubDate>Mon, 10 Aug 2026 01:00:00 GMT</pubDate><description><![CDATA[AI资讯日报 | 每日早读 | 访问网页版 | 进群交流 | OpenAI 发布新模型并开放 API。订阅我们获得更多内容。]]></description></item></channel></rss>`,
      { name: "AI 日报", url: "https://example.com/feed", tags: ["ai"] },
    );
    expect(event?.summary).toBe("OpenAI 发布新模型并开放 API。");
  });

  it("prefers the richer encoded article body over a promotional description", () => {
    const [event] = parseFeedXml(
      `<rss><channel><item>
        <title>2026-08-16日刊</title>
        <link>https://hex2077.dev/docs/2026-08/2026-08-16/</link>
        <description><![CDATA[## AI资讯日报 2026/8/16 | 每日早读 | 全网数据聚合 | ## 今日摘要]]></description>
        <content:encoded><![CDATA[<h2>AI资讯日报 2026/8/16</h2><blockquote>每日早读 | 全网数据聚合</blockquote><h2>今日摘要</h2><pre><code>李飞飞团队发布机器人仿真引擎，皮卡推出四款全新音频生成模型</code></pre><h3>产品与功能更新</h3><p><strong>机器人仿真引擎首发。</strong>系统支持一小时无人干预运行。</p><hr/><h2>AI资讯日报多渠道</h2>]]></content:encoded>
      </item></channel></rss>`,
      { name: "AI 日报", url: "https://example.com/feed", tags: ["ai"] },
    );

    expect(event?.summary).toContain("李飞飞团队发布机器人仿真引擎");
    expect(event?.summary).toContain("机器人仿真引擎首发");
    expect(event?.summary).not.toContain("AI资讯日报多渠道");
  });
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

  it("classifies arXiv items and academic-tagged feeds as papers", () => {
    const arxivEvents = parseFeedXml(
      `<rss><channel><item>
        <title>Reliable tool-using agents</title>
        <link>https://arxiv.org/abs/2608.01234</link>
        <description>A benchmark for agent tool use.</description>
      </item></channel></rss>`,
      {
        name: "arXiv cs.AI",
        url: "https://rss.arxiv.org/rss/cs.AI",
        tags: ["Papers", "Academic"],
      },
    );
    const taggedEvents = parseFeedXml(
      `<rss><channel><item>
        <title>Research note</title>
        <link>https://example.edu/research/note</link>
      </item></channel></rss>`,
      {
        name: "University Research",
        url: "https://example.edu/feed.xml",
        tags: ["Academic"],
      },
    );

    expect(arxivEvents[0]).toMatchObject({
      type: "paper",
      summary: "A benchmark for agent tool use.",
    });
    expect(taggedEvents[0]?.type).toBe("paper");
  });

  it("classifies first-party release feeds as releases", () => {
    const events = parseFeedXml(
      `<feed><entry>
        <id>release-1</id>
        <title>Version 1.0</title>
        <link href="https://example.com/releases/1.0" />
      </entry></feed>`,
      {
        name: "Example Releases",
        url: "https://example.com/releases.atom",
        tags: ["Releases"],
      },
    );

    expect(events[0]).toMatchObject({ type: "release", title: "Version 1.0" });
  });

  it("uses Atom published time before updated time", () => {
    const events = parseFeedXml(
      `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <id>https://blog.xlab.app/p/79b64b8e/</id>
          <title>Agent与人的协作关系</title>
          <link href="https://blog.xlab.app/p/79b64b8e/" />
          <published>2026-03-26T12:30:02.000Z</published>
          <updated>2026-06-28T16:37:58.196Z</updated>
          <summary>AI的超级入口固然重要。</summary>
        </entry>
      </feed>`,
      {
        name: "明天的乌云",
        url: "https://blog.xlab.app/atom.xml",
        tags: ["ai"],
      },
    );

    expect(events[0]?.createdAt).toBe("2026-03-26T12:30:02.000Z");
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
});

import { describe, expect, it } from "vite-plus/test";

import type { WebPageSubscription } from "../../src/infrastructure/config.js";
import { extractWebPageEntries, WebPageClient } from "../../src/infrastructure/web-page.js";

const source: WebPageSubscription = {
  type: "page",
  name: "Example News",
  url: "https://example.com/news",
  pathPrefixes: ["/news/"],
  tags: ["AI", "News"],
};

describe("web page sources", () => {
  it("combines repeated date and title links for one same-origin article", () => {
    const entries = extractWebPageEntries(
      `<a href="/news/agent-release"><time datetime="2026-08-12">Aug 12, 2026</time></a>
       <a href="/news/agent-release">Agent Mode is generally available</a>
       <a href="https://other.example/news/ignored"><time datetime="2026-08-12">Ignored</time></a>
       <a href="/about"><time datetime="2026-08-12">About</time></a>`,
      source,
    );

    expect(entries).toEqual([
      {
        url: "https://example.com/news/agent-release",
        title: "Agent Mode is generally available",
        publishedAt: "2026-08-12T12:00:00.000Z",
      },
    ]);
  });

  it("prefers a structured title and preserves a card summary", () => {
    expect(
      extractWebPageEntries(
        `<a href="/news/agent-release">
          <time>Aug 11, 2026</time><span class="card-title">Introducing Agent Mode</span>
          <p>A reliable long-running agent.</p>
        </a>`,
        source,
      ),
    ).toEqual([
      {
        url: "https://example.com/news/agent-release",
        title: "Introducing Agent Mode",
        publishedAt: "2026-08-11T12:00:00.000Z",
        summary: "A reliable long-running agent.",
      },
    ]);
  });

  it("rejects parser drift instead of reporting a healthy empty source", async () => {
    const client = new WebPageClient({
      fetch: async () => new Response(`<a href="/news/no-date">No date</a>`),
    });

    await expect(client.getEvents(source)).rejects.toThrow("returned no dated links");
  });

  it("retries transient fetch failures but not permanent HTTP errors", async () => {
    let attempts = 0;
    const client = new WebPageClient({
      fetch: async () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("network reset");
        return new Response(
          `<a href="/news/retry"><time datetime="2026-08-12">Aug 12</time>Retry succeeded</a>`,
        );
      },
      sleep: async () => undefined,
    });

    await expect(client.getEvents(source)).resolves.toEqual([
      expect.objectContaining({ title: "Retry succeeded", source: "web" }),
    ]);
    expect(attempts).toBe(2);

    const blocked = new WebPageClient({
      fetch: async () => new Response("blocked", { status: 403 }),
      sleep: async () => undefined,
    });
    await expect(blocked.getEvents(source)).rejects.toThrow("returned 403");
  });
});

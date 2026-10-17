import { describe, expect, it } from "vite-plus/test";

import {
  extractWebPageEntries,
  acquireWebPage,
} from "../../../../../src/acquisition/domain/item/adapters/web-page.js";
import type { WebPageSubscription } from "../../../../../src/acquisition/domain/source/subscription.js";

const source: WebPageSubscription = {
  type: "page",
  name: "Example News",
  url: "https://example.com/news",
  pathPrefixes: ["/news/"],
  tags: ["AI", "News"],
};

describe("web page sources", () => {
  it("reads a blog card title without mixing in its author and reading time", () => {
    const entries = extractWebPageEntries(
      `<a href="/news/efficiency"><article>
        <div><time datetime="2026-10-06">Oct 6, 2026</time><span>Research</span></div>
        <div><p>Improved token efficiency</p></div><span>Research team · 7m</span>
      </article></a>`,
      source,
    );
    expect(entries).toEqual([
      {
        url: "https://example.com/news/efficiency",
        title: "Improved token efficiency",
        publishedAt: "2026-10-06T12:00:00.000Z",
      },
    ]);
  });

  it("keeps the body of each changelog entry with its own dated links", () => {
    const entries = extractWebPageEntries(
      `<article>
        <p><a href="/news/remote"><time datetime="2026-10-06">Oct 6</time></a></p>
        <h2><a href="/news/remote">Remote control</a></h2>
        <p>Reply to your local agents from the mobile app.</p>
        <p>Your computer must stay online.</p>
      </article><article>
        <a href="/news/next"><time datetime="2026-10-07">Oct 7</time><h2>Next update</h2></a>
        <p>This text belongs to the next update.</p>
      </article>`,
      source,
    );
    expect(entries[0]).toMatchObject({
      title: "Remote control",
      summary: "Reply to your local agents from the mobile app. Your computer must stay online.",
    });
    expect(entries[1]?.summary).toBe("This text belongs to the next update.");
  });

  it("does not borrow a shared article body across different entry URLs", () => {
    const entries = extractWebPageEntries(
      `<article><a href="/news/one"><time datetime="2026-10-06">Oct 6</time><h2>One</h2></a>
       <a href="/news/two"><time datetime="2026-10-07">Oct 7</time><h2>Two</h2></a>
       <p>Unattributed shared content.</p></article>`,
      source,
    );
    expect(entries.every(({ summary }) => summary === undefined)).toBe(true);
  });

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

  it("builds a publication item beside the listing card", () => {
    const [acquired] = acquireWebPage(
      `<a href="/news/agent-release"><time datetime="2026-08-12">Aug 12, 2026</time>Agent Mode is generally available</a>`,
      source,
    );
    expect(acquired?.card).toMatchObject({
      type: "article",
      source: "web",
      title: "Agent Mode is generally available",
      createdAt: "2026-08-12T12:00:00.000Z",
    });
    expect(acquired?.item).toMatchObject({
      kind: "publication",
      signals: [{ type: "article", label: "website source: Example News" }],
      subject: { key: "publication:https://example.com/news/agent-release" },
    });
  });
});

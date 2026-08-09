import { Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";

import { loadConfig } from "../../src/infrastructure/config.js";

vi.mock("../../src/infrastructure/rss.js", () => ({
  RssClient: class {
    getFeedEvents(feed: { name: string; url: string; tags: string[] }) {
      return Promise.resolve([
        {
          id: `rss:${feed.url}:1`,
          type: "article",
          source: "rss",
          actor: feed.name,
          repo: `rss:${feed.url}`,
          createdAt: "2026-08-09T01:00:00.000Z",
          action: "published",
          htmlUrl: `${feed.url}/post`,
          title: `${feed.name} agent release`,
          sourceName: feed.name,
          sourceUrl: feed.url,
          tags: feed.tags,
        },
      ]);
    }
  },
}));

describe("industry brief", () => {
  it("collects RSS-only candidates without touching GitHub", async () => {
    const config = loadConfig({ GITHUB_USERNAME: "PerfectPan", FEED_TIMEZONE_OFFSET: "+08:00" }, [
      "--only-new",
      "--day",
      "2026-08-09",
    ]);
    const { buildIndustryDocument } = await import("../../src/application/industry-brief.js");

    const document = await Effect.runPromise(buildIndustryDocument(config));

    expect(document.candidates.length).toBeGreaterThan(0);
    expect(document.candidates.every((candidate) => candidate.source === "rss")).toBe(true);
  });
});

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";

import { loadConfig } from "../../src/infrastructure/config.js";

vi.mock("../../src/infrastructure/rss.js", () => ({
  RssClient: class {
    getFeedEvents(feed: { name: string; url: string; tags: string[] }) {
      return Promise.resolve([
        {
          id: `rss:${feed.url}:1`,
          type: feed.tags.includes("Papers") ? "paper" : "article",
          source: "rss",
          actor: feed.name,
          repo: `rss:${feed.url}`,
          createdAt: "2026-08-09T01:00:00.000Z",
          action: "published",
          htmlUrl: `${feed.url}/post`,
          title: `${feed.name} agent release`,
          summary: "A coding agent uses tools reliably.",
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

  it("bounds the abstract-matched paper research queue", async () => {
    const config = loadConfig({ FEED_TIMEZONE_OFFSET: "+08:00" }, [
      "--day",
      "2026-08-09",
      "--max-papers",
      "1",
    ]);
    const { buildIndustryDocument } = await import("../../src/application/industry-brief.js");

    const document = await Effect.runPromise(buildIndustryDocument(config));

    expect(document.candidates.filter((candidate) => candidate.category === "paper")).toHaveLength(
      1,
    );
  });

  it("filters papers already researched in the industry state", async () => {
    const root = await mkdtemp(join(tmpdir(), "rss-summary-industry-research-"));
    const stateFile = join(root, "industry-state.json");
    const args = [
      "--day",
      "2026-08-09",
      "--only-new",
      "--max-papers",
      "1",
      "--industry-state-file",
      stateFile,
    ];
    const { buildIndustryDocument } = await import("../../src/application/industry-brief.js");

    try {
      const initial = await Effect.runPromise(
        buildIndustryDocument(loadConfig({ FEED_TIMEZONE_OFFSET: "+08:00" }, args)),
      );
      const paper = initial.candidates.find((candidate) => candidate.category === "paper");
      expect(paper?.url).toBeDefined();
      if (!paper?.url) throw new Error("Expected a paper candidate URL");
      await writeFile(
        stateFile,
        JSON.stringify({
          seen: {},
          researched: {
            [`rss:${paper.url}`]: { at: "2026-08-09T02:00:00.000Z", decision: "read" },
          },
        }),
      );

      const filtered = await Effect.runPromise(
        buildIndustryDocument(loadConfig({ FEED_TIMEZONE_OFFSET: "+08:00" }, args)),
      );

      expect(filtered.candidates.some((candidate) => candidate.category === "paper")).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

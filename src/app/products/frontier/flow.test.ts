import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";

import { parseCliArgs } from "../../config/argv.js";
import { applyCliArgs, loadEnvConfig } from "../../config/env.js";
import { AppLive, appLiveOptions } from "../../layers.js";

async function resolveConfig(env: NodeJS.ProcessEnv, argv: string[]) {
  const base = await Effect.runPromise(loadEnvConfig(env));
  return applyCliArgs(base, parseCliArgs(argv));
}

async function build(env: NodeJS.ProcessEnv, argv: string[]) {
  const { buildIndustryDocument } = await import("./flow.js");
  const config = await resolveConfig(env, argv);
  return Effect.runPromise(
    Effect.provide(buildIndustryDocument(config), AppLive(appLiveOptions(config))),
  );
}

vi.mock("../../../acquisition/infra/adapters/rss-http.js", () => ({
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

vi.mock("../../../acquisition/infra/adapters/web-page-http.js", () => ({
  WebPageClient: class {
    getEvents(source: { name: string; url: string; tags: string[] }) {
      return Promise.resolve([
        {
          id: `web:${source.url}:1`,
          type: "article",
          source: "web",
          actor: source.name,
          repo: `web:${source.url}/post`,
          createdAt: "2026-08-09T02:00:00.000Z",
          action: "published",
          htmlUrl: `${source.url}/post`,
          title: `${source.name} product update`,
          sourceName: source.name,
          sourceUrl: source.url,
          tags: source.tags,
        },
      ]);
    }
  },
}));

describe("industry brief", () => {
  it("collects first-party RSS and page candidates without touching GitHub", async () => {
    const document = await build(
      { GITHUB_USERNAME: "PerfectPan", FEED_TIMEZONE_OFFSET: "+08:00" },
      ["--only-new", "--day", "2026-08-09"],
    );

    expect(document.candidates.length).toBeGreaterThan(0);
    expect(new Set(document.candidates.map((candidate) => candidate.source))).toEqual(
      new Set(["rss", "web"]),
    );
  });

  it("bounds the abstract-matched paper research queue", async () => {
    const document = await build({ FEED_TIMEZONE_OFFSET: "+08:00" }, [
      "--day",
      "2026-08-09",
      "--max-papers",
      "1",
    ]);

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
    try {
      const initial = await build({ FEED_TIMEZONE_OFFSET: "+08:00" }, args);
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

      const filtered = await build({ FEED_TIMEZONE_OFFSET: "+08:00" }, args);

      expect(filtered.candidates.some((candidate) => candidate.category === "paper")).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

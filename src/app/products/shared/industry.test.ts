import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { parseCliArgs } from "../../config/argv.js";
import { applyCliArgs, loadEnvConfig } from "../../config/env.js";
import { AppLive, appLiveOptions } from "../../layers.js";

async function resolveConfig(env: NodeJS.ProcessEnv, argv: string[]) {
  const base = await Effect.runPromise(loadEnvConfig(env));
  return applyCliArgs(base, parseCliArgs(argv));
}

async function build(env: NodeJS.ProcessEnv, argv: string[]) {
  const { buildIndustryDocument } = await import("./industry.js");
  const config = await resolveConfig(env, argv);
  return Effect.runPromise(
    Effect.provide(buildIndustryDocument(config), AppLive(appLiveOptions(config))),
  );
}

// Every industry source (industry-feeds.json) serves exactly one in-window
// item: RSS feeds one feed item, page sources one dated link.
const industrySources = JSON.parse(
  readFileSync(new URL("../../../../industry-feeds.json", import.meta.url), "utf8"),
) as Array<{ name: string; url: string; tags: string[]; type?: string; pathPrefixes?: string[] }>;

beforeEach(() => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const source = industrySources.find((entry) => entry.url === url);
    if (!source) return new Response("not found", { status: 404 });
    if (source.type === "page") {
      const prefix = source.pathPrefixes?.[0] ?? "/";
      const slug = prefix.replace(/^\//u, "").replace(/\/$/u, "");
      return new Response(
        `<!doctype html><html><body><a href="${prefix}${slug}-post"><h2>${source.name} product update</h2><time datetime="2026-08-09T02:00:00Z">Aug 9</time></a></body></html>`,
        { status: 200, headers: { "content-type": "text/html" } },
      );
    }
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${source.name}</title><item><title>${source.name} agent release</title><link>${source.url}/post</link><guid>${source.url}/post</guid><pubDate>Sun, 09 Aug 2026 01:00:00 GMT</pubDate><description>A coding agent uses tools reliably.</description></item></channel></rss>`,
      { status: 200, headers: { "content-type": "application/rss+xml" } },
    );
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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

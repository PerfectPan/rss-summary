import { existsSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { IndustryBriefDocument } from "../shared/industry.js";
import type { AppConfig } from "../../config/env.js";
import { generateRivusIndustryBrief } from "./tool.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Rivus industry brief adapter", () => {
  it("renders markdown from the industry document and reports candidate count", async () => {
    const document: IndustryBriefDocument = {
      generatedAt: "2026-08-09T01:00:00.000Z",
      windowLabel: "2026-08-09 +08:00",
      candidates: [
        {
          repo: "rss:https://example.com/a",
          source: "rss",
          category: "article",
          score: 40,
          actors: ["OpenAI"],
          eventTypes: ["article"],
          reasons: ["matches interest: agent"],
          matchedInterests: ["agent"],
          events: [],
          label: "Agent release",
          url: "https://example.com/a",
        },
      ],
    };

    const result = await generateRivusIndustryBrief(
      { occurrence: "2026-08-09T01:00:00.000Z" },
      {
        env: { FEED_TIMEZONE_OFFSET: "+08:00" },
        buildIndustryDocument: () => Effect.succeed(document),
      },
    );

    expect(result.candidateCount).toBe(1);
    expect(result.paperCandidateCount).toBe(0);
    expect(result.markdown).toContain("# 行业前沿 · 2026-08-09");
    expect(result.markdown).toContain("**[Agent release](https://example.com/a)**");
  });

  it("reports papers as pending instead of publishing their titles", async () => {
    const document: IndustryBriefDocument = {
      generatedAt: "2026-08-09T01:00:00.000Z",
      candidates: [
        {
          repo: "rss:https://arxiv.org/abs/2608.01234",
          source: "rss",
          category: "paper",
          score: 55,
          actors: ["arXiv cs.AI"],
          eventTypes: ["paper"],
          reasons: ["matches paper abstract: agent"],
          events: [],
          label: "Unverified agent claim",
          url: "https://arxiv.org/abs/2608.01234",
        },
      ],
    };

    const result = await generateRivusIndustryBrief(undefined, {
      env: {},
      buildIndustryDocument: () => Effect.succeed(document),
    });

    expect(result).toMatchObject({ candidateCount: 0, paperCandidateCount: 1 });
    expect(result.markdown).not.toContain("Unverified agent claim");
  });

  it("rejects day and occurrence used together", async () => {
    await expect(
      generateRivusIndustryBrief(
        { day: "2026-08-09", occurrence: "2026-08-09T01:00:00.000Z" },
        { env: {} },
      ),
    ).rejects.toThrow(/cannot be used together/);
  });
});

describe("frontier Tool onlyNew semantics", () => {
  async function requestedOnlyNew(input: unknown, env: NodeJS.ProcessEnv) {
    let seen: AppConfig | undefined;
    await generateRivusIndustryBrief(input, {
      env,
      buildIndustryDocument: (config) => {
        seen = config;
        return Effect.succeed({ generatedAt: "2026-08-09T01:00:00.000Z", candidates: [] });
      },
    });
    return seen!;
  }

  it("defaults to only-new when the input omits onlyNew, even if the environment asks otherwise", async () => {
    expect(await requestedOnlyNew({ occurrence: "2026-08-09T01:00:00.000Z" }, {})).toMatchObject({
      onlyNew: true,
    });
    expect(
      await requestedOnlyNew({ occurrence: "2026-08-09T01:00:00.000Z" }, { FEED_ONLY_NEW: "true" }),
    ).toMatchObject({ onlyNew: true });
  });

  it("keeps an explicit onlyNew: true", async () => {
    const config = await requestedOnlyNew(
      { occurrence: "2026-08-09T01:00:00.000Z", onlyNew: true },
      {},
    );
    expect(config.onlyNew).toBe(true);
  });

  it("lets an explicit onlyNew: false fall back to FEED_ONLY_NEW", async () => {
    expect(
      await requestedOnlyNew(
        { occurrence: "2026-08-09T01:00:00.000Z", onlyNew: false },
        { FEED_ONLY_NEW: "true" },
      ),
    ).toMatchObject({ onlyNew: true });
    expect(
      await requestedOnlyNew({ occurrence: "2026-08-09T01:00:00.000Z", onlyNew: false }, {}),
    ).toMatchObject({ onlyNew: false });
  });
});

describe("frontier Tool dry-run safety", () => {
  const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Industry Feed</title>
  <entry>
    <title>Documented change</title>
    <link href="https://example.com/change" rel="alternate"/>
    <id>https://example.com/change</id>
    <updated>2026-08-09T00:00:00Z</updated>
  </entry>
</feed>`;

  it("always requests a dry-run configuration with the webhook suppressed", async () => {
    let seen: AppConfig | undefined;
    await generateRivusIndustryBrief(
      { occurrence: "2026-08-09T01:00:00.000Z" },
      {
        env: { NOTIFY_WEBHOOK_URL: "https://example.com/webhook" },
        buildIndustryDocument: (config) => {
          seen = config;
          return Effect.succeed({ generatedAt: "2026-08-09T01:00:00.000Z", candidates: [] });
        },
      },
    );
    expect(seen).toMatchObject({ dryRun: true, webhookUrl: undefined });
  });

  it("collects without writing industry state or contacting the webhook", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rss-summary-industry-tool-"));
    const industryStateFile = join(directory, "industry-state.json");
    const webhookUrl = "https://example.com/webhook";
    const fetchedUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === "string" ? input : input.toString();
        fetchedUrls.push(url);
        return new Response(atom, {
          status: 200,
          headers: { "content-type": "application/atom+xml" },
        });
      }),
    );

    try {
      const result = await generateRivusIndustryBrief(
        { occurrence: "2026-08-09T01:00:00.000Z" },
        {
          env: {
            FEED_TIMEZONE_OFFSET: "+08:00",
            FEED_INTERESTS: "typescript",
            INDUSTRY_SOURCES: JSON.stringify([
              { name: "Industry Feed", url: "https://example.com/industry.xml", tags: [] },
            ]),
            INDUSTRY_STATE_FILE: industryStateFile,
            NOTIFY_WEBHOOK_URL: webhookUrl,
          },
        },
      );

      expect(result.generatedAt).toBeTruthy();
      expect(existsSync(industryStateFile)).toBe(false);
      expect(existsSync(join(directory, "runs"))).toBe(false);
      expect(fetchedUrls).toContain("https://example.com/industry.xml");
      expect(fetchedUrls).not.toContain(webhookUrl);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});

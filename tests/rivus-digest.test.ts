import { describe, expect, it, vi } from "vitest";

import { generateRivusDigest } from "../src/rivus-digest.js";

describe("Rivus digest Tool adapter", () => {
  it("maps a scheduled occurrence to the configured local day without delivery or state writes", async () => {
    const buildDigestDocument = vi.fn(async (config) => ({
      generatedAt: "2026-07-16T18:00:00.000Z",
      username: config.username,
      sourceMode: "rss" as const,
      windowLabel: `${config.day} ${config.timezoneOffset}`,
      candidates: [],
    }));

    const result = await generateRivusDigest(
      { occurrence: "2026-07-16T18:00:00.000Z", onlyNew: true, rssOnly: true },
      {
        buildDigestDocument,
        env: { FEED_TIMEZONE_OFFSET: "+08:00", GITHUB_USERNAME: "PerfectPan" },
      },
    );

    expect(buildDigestDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        day: "2026-07-17",
        dryRun: true,
        onlyNew: true,
        rssOnly: true,
        timezoneOffset: "+08:00",
      }),
    );
    expect(result).toEqual({
      candidateCount: 0,
      generatedAt: "2026-07-16T18:00:00.000Z",
      markdown: expect.stringMatching(/^# 每日技术情报 · 2026-07-17\n/u),
      windowLabel: "2026-07-17 +08:00",
    });
  });

  it("rejects ambiguous or malformed date input before running the digest", async () => {
    const buildDigestDocument = vi.fn();

    await expect(
      generateRivusDigest(
        { day: "2026-07-17", occurrence: "2026-07-17T02:00:00.000Z" },
        { buildDigestDocument, env: {} },
      ),
    ).rejects.toThrow(/day.*occurrence/i);
    await expect(
      generateRivusDigest({ day: "17-07-2026" }, { buildDigestDocument, env: {} }),
    ).rejects.toThrow(/YYYY-MM-DD/i);
    expect(buildDigestDocument).not.toHaveBeenCalled();
  });

  it("lets explicit false Tool input override deployment environment defaults", async () => {
    const buildDigestDocument = vi.fn(async (config) => ({
      generatedAt: "2026-07-17T02:00:00.000Z",
      username: config.username,
      candidates: [],
    }));

    await generateRivusDigest(
      { onlyNew: false, rssOnly: false },
      {
        buildDigestDocument,
        env: { FEED_ONLY_NEW: "true", FEED_RSS_ONLY: "true", RSS_FEEDS: "[]" },
      },
    );

    expect(buildDigestDocument).toHaveBeenCalledWith(
      expect.objectContaining({ onlyNew: false, rssOnly: false }),
    );
  });
});

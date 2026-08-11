import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../../src/application/daily-ai-digest.js", () => ({
  generateDailyAiDigest: vi.fn(async () => ({
    day: "2026-08-10",
    generatedAt: "2026-08-11T01:00:00Z",
    evidence: [],
    items: [],
    warnings: [],
    audit: { decisions: [] },
    deliveryReceipt: {
      id: "daily-ai:2026-08-11",
      occurrence: "2026-08-11T01:00:00Z",
      evidenceIds: [],
      committed: false,
    },
  })),
}));

import { generateRivusDailyAiDigest } from "../../src/presentation/rivus-daily-ai.js";

describe("Rivus Daily AI adapter", () => {
  it("returns only validator-rendered markdown", async () => {
    const result = await generateRivusDailyAiDigest({ occurrence: "2026-08-11T01:00:00Z" });
    expect(result.markdown).toContain("# Daily AI Digest · 2026-08-10");
    expect(result.markdown).toContain("质量不足不凑数");
  });
});

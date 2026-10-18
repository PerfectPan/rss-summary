import { describe, expect, it } from "vite-plus/test";

import { buildDailyAiDigest, type DailyAiEvidence } from "../../../index.js";
import { DailyAiDraftValidationError } from "./daily-ai-draft.js";

const evidence = (overrides: Partial<DailyAiEvidence> = {}): DailyAiEvidence => ({
  id: "source-1",
  title: "Path to Astra",
  url: "https://openai.com/index/path-to-astra",
  publishedAt: "2026-09-01T13:00:00.000Z",
  excerpt: "OpenAI says Astra meets the Critical cybersecurity capability threshold.",
  tier: "official",
  sourceName: "OpenAI",
  topicId: "developer-tools",
  ...overrides,
});

describe("Daily AI editorial domain", () => {
  it("fails generation instead of rendering no-news when every draft item is invalid", () => {
    expect(() =>
      buildDailyAiDigest([evidence()], {
        draft: [{ category: "unknown", headline: "Astra", refs: ["missing"] }],
      }),
    ).toThrow(DailyAiDraftValidationError);
  });
});

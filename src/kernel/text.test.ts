import { describe, expect, it } from "vite-plus/test";

import {
  canonicalizeUrl,
  compactSummary,
  errorMessage,
  formatCompactCount,
  parsePublishTime,
} from "./text.js";

describe("domain/text", () => {
  it("canonicalizes URLs by stripping tracking params and trailing slashes", () => {
    expect(canonicalizeUrl("https://example.com/path/?utm_source=x&ref=1#hash")).toBe(
      "https://example.com/path",
    );
    expect(canonicalizeUrl("not a url")).toBeUndefined();
  });

  it("parses publish times with optional timezone offset", () => {
    expect(parsePublishTime("2026-07-29T09:00:00+08:00")).toBe(
      Date.parse("2026-07-29T09:00:00+08:00"),
    );
    expect(parsePublishTime("2026-07-29 09:00:00", "+08:00")).toBe(
      Date.parse("2026-07-29T09:00:00+08:00"),
    );
  });

  it("compacts summaries to the first two sentences", () => {
    expect(compactSummary("Title. First sentence. Second sentence. Third.", "Title")).toContain(
      "First sentence",
    );
  });

  it("formats thrown values as a single-line message", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
  });

  it("formats compact counts for stars and metrics", () => {
    expect(formatCompactCount(999)).toBe("999");
    expect(formatCompactCount(1_234)).toBe("1.2k");
    expect(formatCompactCount(2_500_000)).toBe("2.5m");
  });
});

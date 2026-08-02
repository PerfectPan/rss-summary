import { describe, expect, it } from "vite-plus/test";

import { displayTime, formatStarCount, markdownLinkText } from "../../src/presentation/markdown.js";

describe("presentation/markdown", () => {
  it("escapes link text and formats stars and clock times", () => {
    expect(markdownLinkText("a[b]\\c")).toBe("a\\[b\\]\\\\c");
    expect(formatStarCount(1_500)).toBe("1.5k");
    expect(displayTime("2026-07-29T09:15:00+08:00")).toBe("09:15");
    expect(displayTime(undefined)).toBeUndefined();
  });
});

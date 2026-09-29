import { describe, expect, it } from "vite-plus/test";
import { newsPublicationRange } from "../../src/domain/news-time.js";

describe("publication precision", () => {
  it("preserves a whole date rather than inventing a midnight publication", () => {
    const result = newsPublicationRange("2026-09-28", "+08:00")!;
    expect(result.precision).toBe("date");
    expect(result.until - result.since).toBe(50 * 3_600_000);
    expect(new Date(result.since).toISOString()).toBe("2026-09-27T10:00:00.000Z");
  });
  it("rejects impossible dates and keeps explicit instant offsets", () => {
    expect(newsPublicationRange("2026-02-30")).toBeUndefined();
    expect(newsPublicationRange(undefined)).toBeUndefined();
    expect(newsPublicationRange("2026-09-29T09:30:00+08:00")?.since).toBe(
      Date.parse("2026-09-29T01:30:00Z"),
    );
  });
});

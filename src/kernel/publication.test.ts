import { describe, expect, it } from "vite-plus/test";
import { newsPublicationDayRange, newsPublicationRange } from "./publication.js";

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

  it("resolves a known-timezone day to exactly that zone's 24 hours", () => {
    const result = newsPublicationDayRange({ day: "2026-09-28", timezoneOffset: "+08:00" })!;
    expect(result.precision).toBe("day");
    expect(result).toEqual({
      since: Date.parse("2026-09-28T00:00:00+08:00"),
      until: Date.parse("2026-09-29T00:00:00+08:00"),
      precision: "day",
    });
  });

  it("rejects impossible days and invalid offsets", () => {
    expect(
      newsPublicationDayRange({ day: "2026-02-30", timezoneOffset: "+08:00" }),
    ).toBeUndefined();
    expect(newsPublicationDayRange({ day: "not-a-day", timezoneOffset: "+08:00" })).toBeUndefined();
    expect(
      newsPublicationDayRange({ day: "2026-09-28", timezoneOffset: "Beijing" }),
    ).toBeUndefined();
  });
});

import { parsePublishTime } from "./text.js";

/** A date describes a whole day; never manufacture an intra-day publication instant. */
export function newsPublicationRange(value: string | undefined, timezoneOffset = "+08:00") {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
      return undefined;
    // Metadata without an offset does not establish the publisher's time zone.
    // Enclose the date across UTC+14 through UTC-12 rather than adopting the reader's zone.
    const since = parsed.getTime() - 14 * 3_600_000;
    return { since, until: parsed.getTime() + 36 * 3_600_000, precision: "date" as const };
  }
  const since = parsePublishTime(value, timezoneOffset);
  return Number.isFinite(since)
    ? { since, until: since + 1, precision: "instant" as const }
    : undefined;
}

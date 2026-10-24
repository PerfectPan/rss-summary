import { startOfCalendarDay } from "./time.js";
import { parsePublishTime } from "./text.js";

/**
 * A publication the provider reported as a calendar day in a known timezone.
 * Unlike a bare date, the day can be resolved to exactly that zone's 24 hours.
 */
export type PublicationDay = {
  readonly day: string;
  readonly timezoneOffset: string;
};

/** A calendar day in a known timezone covers exactly that zone's day. */
export function newsPublicationDayRange(
  value: PublicationDay,
): { since: number; until: number; precision: "day" } | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value.day)) return undefined;
  const parsed = new Date(`${value.day}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value.day)
    return undefined;
  try {
    const since = startOfCalendarDay(value.day, value.timezoneOffset);
    return { since, until: since + 86_400_000, precision: "day" as const };
  } catch {
    return undefined;
  }
}

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

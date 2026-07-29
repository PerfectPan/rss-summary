export function calendarDayAtOffset(occurrence: string, timezoneOffset: string): string {
  const instant = Date.parse(occurrence);
  if (!Number.isFinite(instant)) throw new Error("occurrence must be a valid date-time.");
  return new Date(instant + parseOffsetMilliseconds(timezoneOffset)).toISOString().slice(0, 10);
}

export function shiftCalendarDay(day: string, delta: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) throw new Error("day must use YYYY-MM-DD format.");
  const instant = Date.parse(`${day}T00:00:00Z`);
  return new Date(instant + delta * 86_400_000).toISOString().slice(0, 10);
}

export function startOfCalendarDay(day: string, timezoneOffset: string): number {
  parseOffsetMilliseconds(timezoneOffset);
  const instant = Date.parse(`${day}T00:00:00${timezoneOffset}`);
  if (!Number.isFinite(instant)) throw new Error(`Unable to parse calendar day: ${day} ${timezoneOffset}`);
  return instant;
}

export function parseOffsetMilliseconds(timezoneOffset: string): number {
  const match = /^([+-])(\d{2}):(\d{2})$/u.exec(timezoneOffset);
  if (!match) throw new Error("FEED_TIMEZONE_OFFSET must use +HH:MM or -HH:MM format.");
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) throw new Error("FEED_TIMEZONE_OFFSET is outside the valid range.");
  const direction = match[1] === "+" ? 1 : -1;
  return direction * (hours * 60 + minutes) * 60_000;
}

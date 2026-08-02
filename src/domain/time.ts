export type EventWindow = {
  since: number;
  until?: number;
  label: string;
};

export type EventWindowConfig = {
  since?: string;
  until?: string;
  day?: string;
  timezoneOffset: string;
  windowHours: number;
};

const dayPattern = /^\d{4}-\d{2}-\d{2}$/u;
const offsetPattern = /^[+-]\d{2}:\d{2}$/u;

export function calendarDayAtOffset(occurrence: string, timezoneOffset: string): string {
  const instant = Date.parse(occurrence);
  if (!Number.isFinite(instant)) throw new Error("occurrence must be a valid date-time.");
  return new Date(instant + parseOffsetMilliseconds(timezoneOffset)).toISOString().slice(0, 10);
}

export function shiftCalendarDay(day: string, delta: number): string {
  if (!dayPattern.test(day)) throw new Error("day must use YYYY-MM-DD format.");
  const instant = Date.parse(`${day}T00:00:00Z`);
  return new Date(instant + delta * 86_400_000).toISOString().slice(0, 10);
}

export function startOfCalendarDay(day: string, timezoneOffset: string): number {
  parseOffsetMilliseconds(timezoneOffset);
  const instant = Date.parse(`${day}T00:00:00${timezoneOffset}`);
  if (!Number.isFinite(instant))
    throw new Error(`Unable to parse calendar day: ${day} ${timezoneOffset}`);
  return instant;
}

export function endOfCalendarDay(day: string, timezoneOffset: string): number {
  return startOfCalendarDay(day, timezoneOffset) + 86_400_000;
}

export function parseOffsetMilliseconds(timezoneOffset: string): number {
  const match = /^([+-])(\d{2}):(\d{2})$/u.exec(timezoneOffset);
  if (!match) throw new Error("FEED_TIMEZONE_OFFSET must use +HH:MM or -HH:MM format.");
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59)
    throw new Error("FEED_TIMEZONE_OFFSET is outside the valid range.");
  const direction = match[1] === "+" ? 1 : -1;
  return direction * (hours * 60 + minutes) * 60_000;
}

export function resolveEventWindow(config: EventWindowConfig, now = new Date()): EventWindow {
  if (config.since || config.until) {
    return resolveExplicitWindow(config.since, config.until);
  }

  if (config.day) {
    return resolveCalendarDayWindow(config.day, config.timezoneOffset);
  }

  return {
    since: now.getTime() - config.windowHours * 60 * 60 * 1000,
    label: `last ${config.windowHours} hours`,
  };
}

export function isWithinEventWindow(event: { createdAt: string }, window: EventWindow): boolean {
  const createdAt = new Date(event.createdAt).getTime();
  if (!Number.isFinite(createdAt)) return false;
  if (createdAt < window.since) return false;
  return window.until === undefined || createdAt < window.until;
}

function resolveCalendarDayWindow(day: string, timezoneOffset: string): EventWindow {
  if (!dayPattern.test(day)) {
    throw new Error(`FEED_DAY/--day must use YYYY-MM-DD, received: ${day}`);
  }
  if (!offsetPattern.test(timezoneOffset)) {
    throw new Error(
      `FEED_TIMEZONE_OFFSET/--timezone-offset must use +HH:MM or -HH:MM, received: ${timezoneOffset}`,
    );
  }

  const since = Date.parse(`${day}T00:00:00${timezoneOffset}`);
  if (!Number.isFinite(since)) {
    throw new Error(`Unable to parse day window: ${day} ${timezoneOffset}`);
  }

  return {
    since,
    until: since + 24 * 60 * 60 * 1000,
    label: `${day} ${timezoneOffset}`,
  };
}

function resolveExplicitWindow(
  sinceValue: string | undefined,
  untilValue: string | undefined,
): EventWindow {
  if (!sinceValue || !untilValue) {
    throw new Error("FEED_SINCE/--since and FEED_UNTIL/--until must be set together.");
  }

  const since = Date.parse(sinceValue);
  const until = Date.parse(untilValue);
  if (!Number.isFinite(since)) {
    throw new Error(`Unable to parse FEED_SINCE/--since: ${sinceValue}`);
  }
  if (!Number.isFinite(until)) {
    throw new Error(`Unable to parse FEED_UNTIL/--until: ${untilValue}`);
  }
  if (until <= since) {
    throw new Error("FEED_UNTIL/--until must be after FEED_SINCE/--since.");
  }

  return {
    since,
    until,
    label: `${sinceValue} to ${untilValue}`,
  };
}

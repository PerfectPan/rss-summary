export type EventWindow = {
  since: number;
  until?: number;
  label: string;
};

export type EventWindowConfig = {
  day?: string;
  timezoneOffset: string;
  windowHours: number;
};

const dayPattern = /^\d{4}-\d{2}-\d{2}$/u;
const offsetPattern = /^[+-]\d{2}:\d{2}$/u;

export function resolveEventWindow(config: EventWindowConfig, now = new Date()): EventWindow {
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
    throw new Error(`FEED_TIMEZONE_OFFSET/--timezone-offset must use +HH:MM or -HH:MM, received: ${timezoneOffset}`);
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

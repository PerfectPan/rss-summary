import { describe, expect, it } from "vitest";

import { isWithinEventWindow, resolveEventWindow } from "../src/event-window.js";

describe("event window", () => {
  it("uses an Asia/Shanghai calendar day when a day is configured", () => {
    const window = resolveEventWindow({
      day: "2026-06-27",
      timezoneOffset: "+08:00",
      windowHours: 36,
    });

    expect(window).toEqual({
      since: Date.parse("2026-06-27T00:00:00+08:00"),
      until: Date.parse("2026-06-28T00:00:00+08:00"),
      label: "2026-06-27 +08:00",
    });

    expect(isWithinEventWindow({ createdAt: "2026-06-26T15:59:59.999Z" }, window)).toBe(false);
    expect(isWithinEventWindow({ createdAt: "2026-06-26T16:00:00.000Z" }, window)).toBe(true);
    expect(isWithinEventWindow({ createdAt: "2026-06-27T15:59:59.999Z" }, window)).toBe(true);
    expect(isWithinEventWindow({ createdAt: "2026-06-27T16:00:00.000Z" }, window)).toBe(false);
  });

  it("keeps the rolling-hour window when no day is configured", () => {
    const window = resolveEventWindow(
      {
        timezoneOffset: "+08:00",
        windowHours: 36,
      },
      new Date("2026-06-27T10:00:00.000Z"),
    );

    expect(window).toEqual({
      since: Date.parse("2026-06-25T22:00:00.000Z"),
      label: "last 36 hours",
    });
  });

  it("uses an explicit since/until window before calendar or rolling modes", () => {
    const window = resolveEventWindow({
      since: "2026-06-27T09:00:00+08:00",
      until: "2026-06-28T09:00:00+08:00",
      day: "2026-06-28",
      timezoneOffset: "+08:00",
      windowHours: 36,
    });

    expect(window).toEqual({
      since: Date.parse("2026-06-27T09:00:00+08:00"),
      until: Date.parse("2026-06-28T09:00:00+08:00"),
      label: "2026-06-27T09:00:00+08:00 to 2026-06-28T09:00:00+08:00",
    });
  });
});

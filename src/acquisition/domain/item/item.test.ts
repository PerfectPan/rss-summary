import { describe, expect, it } from "vite-plus/test";

import type { SignalType } from "./item.js";

/**
 * One row per historical base-score number: scoring still reads the activity
 * card, and these signals are the 1:1 replacement for each of those numbers.
 */
const baseScoreBySignal: Record<SignalType, number> = {
  endorsed: 90,
  "recommended-trending": 80,
  "recommended-personal": 75,
  announced: 65,
  released: 85,
  forked: 45,
  created: 35,
  relationship: 25,
  "published-article": 30,
  "published-paper": 35,
  "change-merged": 55,
  "change-opened": 35,
  "change-closed": 20,
  "change-other": 5,
};

describe("item signals", () => {
  it("lists one signal for every existing base score, and none for a zero score", () => {
    expect(baseScoreBySignal).toEqual({
      endorsed: 90,
      "recommended-trending": 80,
      "recommended-personal": 75,
      announced: 65,
      released: 85,
      forked: 45,
      created: 35,
      relationship: 25,
      "published-article": 30,
      "published-paper": 35,
      "change-merged": 55,
      "change-opened": 35,
      "change-closed": 20,
      "change-other": 5,
    });
    expect("other" in baseScoreBySignal).toBe(false);
  });
});

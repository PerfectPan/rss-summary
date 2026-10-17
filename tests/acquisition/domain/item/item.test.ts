import { describe, expect, it } from "vite-plus/test";

import type { SignalType } from "../../../../src/acquisition/domain/item/item.js";

/**
 * Same numbers as baseScore in src/domain/digest.ts. Scoring still reads the
 * activity card; these names are the 1:1 signal row for each of those numbers.
 */
const baseScoreBySignal: Record<SignalType, number> = {
  watch: 90,
  trending: 80,
  recommendation: 75,
  announcement: 65,
  release: 85,
  fork: 45,
  create: 35,
  follow: 25,
  article: 30,
  paper: 35,
  "pull-request-merged": 55,
  "pull-request-opened": 35,
  "pull-request-closed": 20,
  "pull-request": 5,
};

describe("item signals", () => {
  it("lists one signal for every existing base score, and none for a zero score", () => {
    expect(baseScoreBySignal).toEqual({
      watch: 90,
      trending: 80,
      recommendation: 75,
      announcement: 65,
      release: 85,
      fork: 45,
      create: 35,
      follow: 25,
      article: 30,
      paper: 35,
      "pull-request-merged": 55,
      "pull-request-opened": 35,
      "pull-request-closed": 20,
      "pull-request": 5,
    });
    expect("other" in baseScoreBySignal).toBe(false);
  });
});

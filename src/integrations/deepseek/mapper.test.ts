import { describe, expect, it } from "vite-plus/test";

import {
  credibilityForAuthority,
  deepSeekPublicationDay,
  deepSeekSourcePolicies,
} from "./mapper.js";

describe("DeepSeek authority mapping", () => {
  it("maps an authority score onto the tiers without ever reaching official", () => {
    expect(credibilityForAuthority(3)).toEqual({ tier: "authoritative" });
    expect(credibilityForAuthority(4)).toEqual({ tier: "authoritative" });
    expect(credibilityForAuthority(2)).toEqual({ tier: "unrated" });
    expect(credibilityForAuthority(0)).toEqual({ tier: "unrated" });
    expect(credibilityForAuthority(-1)).toEqual({ tier: "unrated" });
    expect(credibilityForAuthority(undefined)).toEqual({ tier: "unrated" });
  });

  it("declares only news and authoritative source policies", () => {
    expect(deepSeekSourcePolicies).toEqual(["news", "authoritative"]);
  });
});

describe("DeepSeek date granularity", () => {
  it("reads Beijing-midnight values as the Beijing calendar day they denote", () => {
    // 2026-08-16T16:00:00Z is midnight of Beijing day 2026-08-17.
    expect(deepSeekPublicationDay("2026-08-16T16:00:00Z")).toEqual({
      day: "2026-08-17",
      timezoneOffset: "+08:00",
    });
    expect(deepSeekPublicationDay("2026-12-31T16:00:00.000Z")).toEqual({
      day: "2027-01-01",
      timezoneOffset: "+08:00",
    });
  });

  it("keeps real time-of-day values at instant precision", () => {
    expect(deepSeekPublicationDay("2026-08-16T02:00:00Z")).toBeUndefined();
    expect(deepSeekPublicationDay("2026-08-16T16:00:01Z")).toBeUndefined();
    expect(deepSeekPublicationDay("2026-08-16T15:59:59Z")).toBeUndefined();
    expect(deepSeekPublicationDay("2026-08-16T16:00:00+08:00")).toBeUndefined();
    expect(deepSeekPublicationDay("2026-08-16")).toBeUndefined();
  });
});

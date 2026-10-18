import { describe, expect, it } from "vite-plus/test";

import { credibilityForAuthority, deepSeekSourcePolicies } from "./mapper.js";

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

import { describe, expect, it } from "vite-plus/test";

import { boundedInteger } from "./config.js";

describe("boundedInteger", () => {
  it("returns the fallback when the value is absent", () => {
    expect(boundedInteger(undefined, 10, 1, 50)).toBe(10);
  });

  it("parses an in-range value", () => {
    expect(boundedInteger("20", 10, 1, 50)).toBe(20);
  });

  it("rejects values outside the range, non-integers, and junk", () => {
    expect(() => boundedInteger("0", 10, 1, 50)).toThrow(/integer between/i);
    expect(() => boundedInteger("51", 10, 1, 50)).toThrow(/integer between/i);
    expect(() => boundedInteger("2.5", 10, 1, 50)).toThrow(/integer between/i);
    expect(() => boundedInteger("many", 10, 1, 50)).toThrow(/integer between/i);
  });
});

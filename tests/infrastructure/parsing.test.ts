import { describe, expect, it } from "vitest";

import { asRecord, boundedInteger, hostnameOf, number, text } from "../../src/infrastructure/parsing.js";

describe("infrastructure/parsing", () => {
  it("bounds integer env values", () => {
    expect(boundedInteger(undefined, 10, 1, 50)).toBe(10);
    expect(boundedInteger("20", 10, 1, 50)).toBe(20);
    expect(() => boundedInteger("0", 10, 1, 50)).toThrow(/integer between/i);
  });

  it("strips www. from hostnames and coerces JSON primitives", () => {
    expect(hostnameOf("https://www.example.com/path")).toBe("example.com");
    expect(hostnameOf("not-a-url")).toBe("not-a-url");
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asRecord(null)).toEqual({});
    expect(text("  hi  ")).toBe("hi");
    expect(text(3)).toBe("3");
    expect(text("")).toBeUndefined();
    expect(number(1.5)).toBe(1.5);
    expect(number(Number.NaN)).toBeUndefined();
  });
});

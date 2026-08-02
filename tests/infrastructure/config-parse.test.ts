import { describe, expect, it } from "vite-plus/test";

import {
  optionalBoolean,
  optionalString,
  requireBoundedInteger,
  requirePositiveInteger,
  requireStringList,
  requiredString,
} from "../../src/infrastructure/config-parse.js";

describe("infrastructure/config-parse", () => {
  it("validates strings, booleans, and bounded integers for JSON configs", () => {
    expect(requiredString("  x  ", "x")).toBe("x");
    expect(() => requiredString("", "x")).toThrow(/non-empty string/);
    expect(optionalString(undefined, "fb", "x")).toBe("fb");
    expect(optionalBoolean(undefined, true, "x")).toBe(true);
    expect(optionalBoolean(false, true, "x")).toBe(false);
    expect(requireBoundedInteger(undefined, 8, 1, 16, "q")).toBe(8);
    expect(requireBoundedInteger(5, 8, 1, 16, "q")).toBe(5);
    expect(() => requireBoundedInteger(99, 8, 1, 16, "q")).toThrow(/between 1 and 16/);
    expect(requirePositiveInteger(3, 1, "n")).toBe(3);
    expect(requireStringList(["a", " b "], "list")).toEqual(["a", "b"]);
  });
});

import { describe, expect, it } from "vite-plus/test";

import { asRecord, isRecord } from "../../src/domain/record.js";

describe("domain/record", () => {
  it("asRecord uses lodash isPlainObject semantics", () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asRecord(null)).toEqual({});
    expect(asRecord(undefined)).toEqual({});
    expect(asRecord([1, 2])).toEqual({});
    expect(asRecord("x")).toEqual({});
  });

  it("isRecord is a type guard for plain objects", () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
  });
});

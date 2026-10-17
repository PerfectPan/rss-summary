import { describe, expect, it } from "vite-plus/test";

import { asRecord, isRecord } from "../../src/domain/record.js";

describe("domain/record", () => {
  it("asRecord keeps plain objects, including null-prototype objects", () => {
    const plain = { a: 1 };
    const nullProto = Object.create(null) as Record<string, unknown>;
    nullProto.a = 1;
    expect(asRecord(plain)).toBe(plain);
    expect(asRecord(nullProto)).toBe(nullProto);
    expect(asRecord(null)).toEqual({});
    expect(asRecord(undefined)).toEqual({});
    expect(asRecord([1, 2])).toEqual({});
    expect(asRecord("x")).toEqual({});
    expect(asRecord(new Date())).toEqual({});
  });

  it("isRecord rejects arrays and class instances", () => {
    class Box {
      value = 1;
    }
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(Object.create(null))).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(new Box())).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(asRecord(new Box())).toEqual({});
  });
});

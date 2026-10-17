import { describe, expect, it } from "vite-plus/test";

import { asRecord, text } from "../../../../src/reading/infra/adapters/json-record.js";

describe("json records", () => {
  it("keeps plain objects and drops arrays", () => {
    expect(asRecord({ ok: true })).toEqual({ ok: true });
    expect(asRecord(["slide"])).toEqual({});
    expect(asRecord(null)).toEqual({});
  });

  it("trims text and drops empty strings", () => {
    expect(text("  caption  ")).toBe("caption");
    expect(text("   ")).toBeUndefined();
    expect(text(12)).toBe("12");
  });
});

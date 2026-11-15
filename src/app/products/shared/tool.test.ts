import { describe, expect, it } from "vite-plus/test";

import {
  assertCalendarDay,
  assertNotBothDayAndOccurrence,
  briefBaseInput,
  occurrenceDayOf,
  optionalBoolean,
  optionalToolInput,
  rivusToolResult,
  type RivusToolResult
} from "./tool.js";

describe("tool plumbing", () => {
  it("keeps absent optionals undefined and rejects the wrong types", () => {
    expect(optionalBoolean(undefined, "onlyNew")).toBeUndefined();
    expect(optionalBoolean(true, "onlyNew")).toBe(true);
    expect(() => optionalBoolean("yes", "onlyNew")).toThrow(/must be a boolean/);
    expect(() => briefBaseInput({ day: 3 })).toThrow(/must be a non-empty string/);
  });

  it("treats an absent input as an empty object and rejects the rest", () => {
    expect(optionalToolInput(undefined, "Rivus digest")).toEqual({});
    expect(optionalToolInput({ day: "2026-01-01" }, "Rivus digest")).toEqual({ day: "2026-01-01" });
    expect(() => optionalToolInput(null, "Rivus digest")).toThrow(/input must be an object/);
    expect(() => optionalToolInput([1], "Rivus digest")).toThrow(/input must be an object/);
  });

  it("parses the day/occurrence/onlyNew base the brief Tools share", () => {
    expect(briefBaseInput({ day: "2026-01-01", occurrence: undefined, onlyNew: false })).toEqual({
      day: "2026-01-01",
      occurrence: undefined,
      onlyNew: false
    });
    expect(() => briefBaseInput({ day: "2026-01-01", onlyNew: "false" })).toThrow(/must be a boolean/);
  });

  it("rejects a day together with an occurrence", () => {
    expect(assertNotBothDayAndOccurrence({ day: "2026-01-01" })).toBeUndefined();
    expect(() => assertNotBothDayAndOccurrence({ day: "2026-01-01", occurrence: "2026-01-01T00:00:00Z" })).toThrow(
      /cannot be used together/
    );
  });

  it("resolves the occurrence's local calendar day and validates the day shape", () => {
    expect(occurrenceDayOf({ occurrence: "2026-01-01T02:00:00+08:00" }, "+08:00")).toBe("2026-01-01");
    expect(occurrenceDayOf({}, "+08:00")).toBeUndefined();
    expect(assertCalendarDay("2026-01-01")).toBeUndefined();
    expect(() => assertCalendarDay("01/01/2026")).toThrow(/YYYY-MM-DD/);
  });

  it("builds the Tool result block from the document and the markdown", (): RivusToolResult | undefined => {
    const result: RivusToolResult = rivusToolResult(
      {
        candidates: [{ category: "paper" }, { category: "release" }],
        generatedAt: "2026-01-01T00:00:00Z",
        windowLabel: "2026-01-01",
        audit: {
          version: 2,
          runId: "r",
          product: "frontier",
          generatedAt: "",
          sources: [],
          counts: {
            fetched: 0,
            inWindow: 0,
            ranked: 0,
            selected: 0,
            researchPending: 0
          },
          candidates: []
        }
      },
      "# md"
    );
    expect(result).toMatchObject({
      candidateCount: 1,
      generatedAt: "2026-01-01T00:00:00Z",
      markdown: "# md",
      paperCandidateCount: 1,
      windowLabel: "2026-01-01"
    });
    expect(rivusToolResult({ candidates: [], generatedAt: "g" }, "# md")).not.toHaveProperty("windowLabel");
    expect(rivusToolResult({ candidates: [], generatedAt: "g" }, "# md")).not.toHaveProperty("audit");
    return undefined;
  });
});

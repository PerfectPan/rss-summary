import { expect, it } from "vite-plus/test";
import {
  NewsSearchError,
  editionRotation,
  selectQueryIds,
  shareSearchBudget,
} from "../../../../src/acquisition/domain/search/search.js";
import { DoubaoSearchError } from "../../../../src/acquisition/domain/item/adapters/doubao.js";

it("preserves provider retry metadata across the common search error boundary", () => {
  const error = new DoubaoSearchError("http_429", "limited", { retryAfterMs: 1200 });
  expect(error).toBeInstanceOf(NewsSearchError);
  expect(error).toMatchObject({ code: "http_429", retryAfterMs: 1200, name: "DoubaoSearchError" });
});

it("rotates query ids and shares a fallback budget by remainder", () => {
  expect(editionRotation("1970-01-01", "noon")).toBe(0);
  expect(editionRotation("1970-01-01", "evening")).toBe(1);
  expect(editionRotation("1970-01-02", "noon")).toBe(2);
  expect([...selectQueryIds(["a", "b", "c"], 1, 2)]).toEqual(["b", "c"]);
  expect(shareSearchBudget(5, "b", ["a", "b", "c"], 0)).toBe(2);
  expect(shareSearchBudget(5, "a", ["a", "b", "c"], 1)).toBe(1);
  expect(shareSearchBudget(5, "missing", ["a"], 0)).toBe(0);
  expect(shareSearchBudget(5, "a", [], 0)).toBe(5);
});

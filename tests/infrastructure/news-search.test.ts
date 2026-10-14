import { expect, it } from "vite-plus/test";
import { NewsSearchError } from "../../src/infrastructure/news-search.js";
import { DoubaoSearchError } from "../../src/infrastructure/doubao-search.js";

it("preserves provider retry metadata across the common search error boundary", () => {
  const error = new DoubaoSearchError("http_429", "limited", { retryAfterMs: 1200 });
  expect(error).toBeInstanceOf(NewsSearchError);
  expect(error).toMatchObject({ code: "http_429", retryAfterMs: 1200, name: "DoubaoSearchError" });
});

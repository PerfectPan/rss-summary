import { describe, expect, it } from "vite-plus/test";

import {
  documentMethods,
  type Document,
} from "../../../../src/reading/domain/document/document.js";

describe("document", () => {
  it("keeps the reader methods that domain is allowed to name", () => {
    expect(documentMethods).toEqual(["browser", "http", "captions", "transcription"]);
    const document = {
      content: "body",
      fetchedUrl: "https://example.com/article",
      method: "http",
      retrievedAt: "2026-08-17T01:00:00.000Z",
      title: "Article",
      url: "https://example.com/article",
    } satisfies Document;
    expect(document.method).toBe("http");
  });
});

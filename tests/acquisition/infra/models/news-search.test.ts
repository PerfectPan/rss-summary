import { readFileSync } from "node:fs";
import { Schema } from "effect";
import { expect, it } from "vite-plus/test";

import { newsSearchStateSchema } from "../../../../src/acquisition/infra/models/news-search.js";

const fixture = JSON.parse(
  readFileSync(new URL("../../../fixtures/state/news-search.json", import.meta.url), "utf8"),
) as unknown;

it("decodes the golden state file and rejects an extra property", () => {
  const decoded = Schema.decodeUnknownSync(newsSearchStateSchema)(fixture, {
    onExcessProperty: "error",
  });
  expect(decoded.version).toBe(1);
  expect(decoded.timezoneOffset).toBe("+08:00");
  expect(
    decoded.cache["8f8220deaa9e8fa4a3c7e58360123b078a6df6237c8d2e981279d11d4bdc4f2b"]?.request
      .query,
  ).toBe("OpenAI 正式发布新模型");
  expect(() =>
    Schema.decodeUnknownSync(newsSearchStateSchema)(
      { ...(fixture as object), extra: true },
      { onExcessProperty: "error" },
    ),
  ).toThrow();
});

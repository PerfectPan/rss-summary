import { expect, it } from "vite-plus/test";

import { normalizeHttpProvider } from "./provider-identity.js";

it("strips HTTP credentials, queries and trailing slashes, and keeps other schemes verbatim", () => {
  expect(
    normalizeHttpProvider("https://user:secret-key@search.example.com/web_search/?key=secret-key"),
  ).toBe("https://search.example.com/web_search");
  expect(normalizeHttpProvider("grok://cli/v1/custom-model")).toBe("grok://cli/v1/custom-model");
  expect(() => normalizeHttpProvider("not a url")).toThrow();
});

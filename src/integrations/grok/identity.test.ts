import { expect, it } from "vite-plus/test";

import { normalizeProvider } from "./identity.js";

it("keeps a CLI identity and strips HTTP credentials, queries and trailing slashes", () => {
  expect(normalizeProvider("grok://cli/v1/default")).toBe("grok://cli/v1/default");
  expect(
    normalizeProvider("https://user:secret-key@search.example.com/web_search/?key=secret-key"),
  ).toBe("https://search.example.com/web_search");
  expect(() => normalizeProvider("ftp://search.example.com/web")).toThrow(
    "News search provider must be an HTTP URL or a Grok CLI identity.",
  );
});

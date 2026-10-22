import { expect, it } from "vite-plus/test";

import { allowedSearchDomains, publicUrl } from "./public-url.js";

it("rejects a credentialed URL and a domain that is not a bare hostname", () => {
  expect(publicUrl("https://example.com/post").href).toBe("https://example.com/post");
  expect(() => publicUrl("https://user:secret@example.com/post")).toThrow(
    "A public HTTP(S) URL without credentials is required.",
  );
  expect(allowedSearchDomains(["Example.com"])).toEqual(["example.com"]);
  expect(() => allowedSearchDomains(["example.com/path"])).toThrow(
    "Source domains must be hostnames without paths or ports.",
  );
});

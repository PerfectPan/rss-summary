import { expect, it } from "vite-plus/test";

import {
  allowedSearchDomains,
  parseGlmSearchResults,
  publicUrl,
} from "../../../../../src/acquisition/domain/item/adapters/glm.js";

it("keeps allowed public results, drops the rest, and leaves items unrated", () => {
  const parsed = parseGlmSearchResults(
    [
      { title: "官方", link: "https://docs.example.com/post", content: "正文摘要" },
      { title: "重复", link: "https://docs.example.com/post" },
      { title: "外部", link: "https://csdn.net/post" },
      { title: "私有", link: "http://127.0.0.1/post" },
    ],
    ["example.com"],
  );
  expect(parsed.results).toEqual([
    { title: "官方", url: "https://docs.example.com/post", snippet: "正文摘要" },
  ]);
  expect(parsed.results[0]).not.toHaveProperty("sourceVerification");
  expect(parsed.items[0]).toMatchObject({
    id: "glm:https://docs.example.com/post",
    credibility: { tier: "unrated" },
  });
  expect(parsed.domainRejected).toBe(1);
  expect(parsed.rawResults).toBe(4);
});

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

import { expect, it } from "vite-plus/test";

import { parseGlmSearchResults } from "./mapper.js";

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

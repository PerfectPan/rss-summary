import { describe, expect, it } from "vite-plus/test";

import { decodeIndustryJson } from "./industry-feeds.js";

describe("industry-feeds.json", () => {
  it("keeps the hand parser's document and error text", () => {
    expect(
      decodeIndustryJson(
        JSON.stringify([
          "https://example.com/feed.xml",
          {
            type: "page",
            name: "Example News",
            url: "https://example.com/news",
            pathPrefixes: ["/news/"],
            tags: ["AI"],
            extra: true,
          },
        ]),
      ),
    ).toEqual([
      { name: "example.com", url: "https://example.com/feed.xml", tags: [] },
      {
        type: "page",
        name: "Example News",
        url: "https://example.com/news",
        pathPrefixes: ["/news/"],
        tags: ["AI"],
      },
    ]);
    expect(() => decodeIndustryJson("{}")).toThrow(
      "Industry source configuration must be a JSON array.",
    );
    expect(() =>
      decodeIndustryJson('[{"type":"atom","url":"https://example.com/feed.xml"}]'),
    ).toThrow("Industry source type must be either 'rss' or 'page'.");
  });
});

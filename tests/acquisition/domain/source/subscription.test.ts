import { describe, expect, it } from "vite-plus/test";

import {
  isWebPageSource,
  type IndustrySource,
} from "../../../../src/acquisition/domain/source/subscription.js";

describe("subscription kinds", () => {
  it("narrows a listing page and leaves an RSS subscription unchanged", () => {
    const page: IndustrySource = {
      type: "page",
      name: "Example News",
      url: "https://example.com/news",
      pathPrefixes: ["/news/"],
      tags: [],
    };
    const feed: IndustrySource = { name: "Example", url: "https://example.com/feed.xml", tags: [] };
    expect(isWebPageSource(page)).toBe(true);
    expect(isWebPageSource(feed)).toBe(false);
  });
});

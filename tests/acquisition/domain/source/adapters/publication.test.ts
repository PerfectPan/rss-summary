import { describe, expect, it } from "vite-plus/test";

import {
  isDailyAiPaperSource,
  listingPublicationType,
  rssPublicationType,
} from "../../../../../src/acquisition/domain/source/adapters/publication.js";

const feed = { url: "https://example.com/feed.xml", tags: [] as string[] };

describe("publication classification", () => {
  it("keeps the three call-site rules separate", () => {
    expect(rssPublicationType("https://example.com/post", { ...feed, tags: ["Papers"] })).toBe(
      "paper",
    );
    expect(rssPublicationType("https://example.com/post", { ...feed, tags: ["academic"] })).toBe(
      "paper",
    );
    expect(rssPublicationType("https://arxiv.org/abs/1", { ...feed, tags: ["releases"] })).toBe(
      "release",
    );
    expect(rssPublicationType("https://ARXIV.org/abs/1", feed)).toBe("paper");
    expect(
      rssPublicationType("https://example.com/post", {
        url: "https://export.arxiv.org/rss",
        tags: [],
      }),
    ).toBe("paper");
    expect(rssPublicationType("https://example.com/post", feed)).toBe("article");
    expect(rssPublicationType("not a url", feed)).toBe("article");

    expect(listingPublicationType(["Releases"])).toBe("release");
    expect(listingPublicationType(["papers"])).toBe("paper");
    expect(listingPublicationType([])).toBe("article");

    expect(isDailyAiPaperSource({ url: "https://arxiv.org/list", tags: [] })).toBe(true);
    expect(isDailyAiPaperSource({ url: "https://export.arxiv.org/rss", tags: [] })).toBe(true);
    // The URL parser lowercases hostnames, so an uppercase host matches without an extra toLowerCase.
    expect(isDailyAiPaperSource({ url: "https://ARXIV.org/list", tags: [] })).toBe(true);
    expect(isDailyAiPaperSource({ url: "https://example.com/feed", tags: ["papers"] })).toBe(true);
    expect(isDailyAiPaperSource({ url: "https://example.com/feed", tags: ["Academic"] })).toBe(
      true,
    );
    expect(isDailyAiPaperSource({ url: "https://example.com/feed", tags: ["releases"] })).toBe(
      false,
    );
    expect(() => isDailyAiPaperSource({ url: "not a url", tags: [] })).toThrow(TypeError);
  });
});

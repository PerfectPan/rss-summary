import { describe, expect, it } from "vitest";

import { addFeedSubscription, formatFeedSubscriptions } from "../src/feed-store.js";

describe("feed store", () => {
  it("adds a normalized feed subscription", () => {
    const feeds = addFeedSubscription([], {
      name: " GitHub Blog ",
      url: " https://github.blog/feed ",
      tags: [" github ", "ai", "", "github"],
    });

    expect(feeds).toEqual([
      {
        name: "GitHub Blog",
        url: "https://github.blog/feed",
        tags: ["github", "ai"],
      },
    ]);
  });

  it("rejects duplicate feed URLs", () => {
    expect(() =>
      addFeedSubscription(
        [{ name: "GitHub Blog", url: "https://github.blog/feed", tags: ["github"] }],
        { url: "https://github.blog/feed", tags: ["ai"] },
      ),
    ).toThrow("RSS feed already exists: https://github.blog/feed");
  });

  it("formats subscriptions as stable JSON", () => {
    expect(
      formatFeedSubscriptions([
        {
          name: "GitHub Blog",
          url: "https://github.blog/feed",
          tags: ["github", "ai"],
        },
      ]),
    ).toBe('[\n  {\n    "name": "GitHub Blog",\n    "url": "https://github.blog/feed",\n    "tags": [\n      "github",\n      "ai"\n    ]\n  }\n]\n');
  });
});

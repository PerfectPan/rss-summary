import { describe, expect, it } from "vitest";

import { addFeedSubscription, formatFeedSubscriptions, removeFeedSubscription } from "../src/feed-store.js";

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

  it("removes a feed subscription by URL", () => {
    const feeds = removeFeedSubscription(
      [
        { name: "GitHub Blog", url: "https://github.blog/feed", tags: ["github"] },
        { name: "Deno Blog", url: "https://deno.com/feed", tags: ["deno"] },
      ],
      " https://github.blog/feed ",
    );

    expect(feeds).toEqual([{ name: "Deno Blog", url: "https://deno.com/feed", tags: ["deno"] }]);
  });

  it("rejects removing a missing feed URL", () => {
    expect(() => removeFeedSubscription([], "https://github.blog/feed")).toThrow(
      "RSS feed not found: https://github.blog/feed",
    );
  });
});

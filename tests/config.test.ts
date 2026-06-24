import { describe, expect, it } from "vitest";

import { loadConfig, parseFeedSubscriptions } from "../src/config.js";

describe("config", () => {
  it("loads RSS feed subscriptions from JSON", () => {
    const feeds = parseFeedSubscriptions(
      JSON.stringify([
        {
          name: "Deno Blog",
          url: "https://deno.com/feed",
          tags: ["deno", "runtime"],
        },
      ]),
    );

    expect(feeds).toEqual([
      {
        name: "Deno Blog",
        url: "https://deno.com/feed",
        tags: ["deno", "runtime"],
      },
    ]);
  });

  it("includes RSS feeds in loaded app config", () => {
    const config = loadConfig(
      {
        RSS_FEEDS: '[{"name":"Vercel Blog","url":"https://vercel.com/blog/rss.xml","tags":["nextjs"]}]',
      },
      ["--dry-run"],
    );

    expect(config.rssFeeds).toEqual([
      {
        name: "Vercel Blog",
        url: "https://vercel.com/blog/rss.xml",
        tags: ["nextjs"],
      },
    ]);
  });

  it("loads state and output options from args", () => {
    const config = loadConfig({}, ["--json", "--only-new", "--state-file", ".state/test.json", "--dry-run"]);

    expect(config.outputFormat).toBe("json");
    expect(config.onlyNew).toBe(true);
    expect(config.stateFile).toBe(".state/test.json");
  });
});

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

  it("loads a calendar-day window from args", () => {
    const config = loadConfig({}, ["--day", "2026-06-27", "--timezone-offset", "+08:00", "--dry-run"]);

    expect((config as { day?: string }).day).toBe("2026-06-27");
    expect((config as { timezoneOffset?: string }).timezoneOffset).toBe("+08:00");
  });

  it("uses GitHub Home as the default GitHub feed source", () => {
    const config = loadConfig({}, ["--dry-run"]);

    expect(config.githubFeedSource).toBe("home");
    expect(config.githubHomeFetch).toBe("conduit");
  });

  it("allows received events as an explicit fallback feed source", () => {
    const config = loadConfig({ GITHUB_FEED_SOURCE: "events" }, ["--dry-run"]);

    expect(config.githubFeedSource).toBe("events");
  });

  it("allows rendered browser mode for GitHub Home fetching", () => {
    const config = loadConfig({ GITHUB_HOME_FETCH: "browser" }, ["--dry-run"]);

    expect(config.githubHomeFetch).toBe("browser");
  });
});

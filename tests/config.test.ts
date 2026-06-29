import { readFileSync } from "node:fs";

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

  it("includes RSS feeds from the repository feeds.json by default", () => {
    const config = loadConfig({}, ["--dry-run"]);
    const expectedFeeds = parseFeedSubscriptions(readFileSync(new URL("../feeds.json", import.meta.url), "utf8"));

    expect(config.rssFeeds).toEqual(expectedFeeds);
  });

  it("allows RSS feed subscriptions from env", () => {
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
    const config = loadConfig({}, ["--json", "--only-new", "--rss-only", "--state-file", ".state/test.json", "--dry-run"]);

    expect(config.outputFormat).toBe("json");
    expect(config.onlyNew).toBe(true);
    expect(config.rssOnly).toBe(true);
    expect(config.stateFile).toBe(".state/test.json");
  });

  it("loads rss-only mode from env", () => {
    const config = loadConfig({ FEED_RSS_ONLY: "true" }, ["--dry-run"]);

    expect(config.rssOnly).toBe(true);
  });

  it("loads a calendar-day window from args", () => {
    const config = loadConfig({}, ["--day", "2026-06-27", "--timezone-offset", "+08:00", "--dry-run"]);

    expect((config as { day?: string }).day).toBe("2026-06-27");
    expect((config as { timezoneOffset?: string }).timezoneOffset).toBe("+08:00");
  });

  it("loads an explicit window from args", () => {
    const config = loadConfig(
      {},
      ["--since", "2026-06-27T09:00:00+08:00", "--until", "2026-06-28T09:00:00+08:00", "--dry-run"],
    );

    expect(config.since).toBe("2026-06-27T09:00:00+08:00");
    expect(config.until).toBe("2026-06-28T09:00:00+08:00");
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

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import {
  loadConfig,
  parseFeedSubscriptions,
  parseIndustrySources,
} from "../../src/infrastructure/config.js";

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
    const expectedFeeds = parseFeedSubscriptions(
      readFileSync(new URL("../../feeds.json", import.meta.url), "utf8"),
    );

    expect(config.rssFeeds).toEqual(expectedFeeds);
  });

  it("allows RSS feed subscriptions from env", () => {
    const config = loadConfig(
      {
        RSS_FEEDS:
          '[{"name":"Vercel Blog","url":"https://vercel.com/blog/rss.xml","tags":["nextjs"]}]',
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

  it("keeps personal and industry feed overrides isolated", () => {
    const config = loadConfig(
      {
        INDUSTRY_SOURCES:
          '[{"name":"arXiv","url":"https://rss.arxiv.org/rss/cs.AI","tags":["Papers"]}]',
        RSS_FEEDS: '[{"name":"Personal","url":"https://example.com/personal.xml","tags":["Blog"]}]',
      },
      ["--dry-run"],
    );

    expect(config.rssFeeds.map((feed) => feed.name)).toEqual(["Personal"]);
    expect(config.industrySources.map((feed) => feed.name)).toEqual(["arXiv"]);
  });

  it("keeps the legacy industry feed override as an alias", () => {
    const config = loadConfig(
      { INDUSTRY_FEEDS: '[{"name":"Legacy","url":"https://example.com/feed.xml"}]' },
      ["--dry-run"],
    );

    expect(config.industrySources.map((source) => source.name)).toEqual(["Legacy"]);
  });

  it("loads industry web pages without allowing them in personal feeds", () => {
    const value = JSON.stringify([
      {
        type: "page",
        name: "Example News",
        url: "https://example.com/news",
        pathPrefixes: ["/news/"],
        tags: ["News"],
      },
    ]);

    expect(parseIndustrySources(value)).toEqual([
      {
        type: "page",
        name: "Example News",
        url: "https://example.com/news",
        pathPrefixes: ["/news/"],
        tags: ["News"],
      },
    ]);
    expect(() => parseFeedSubscriptions(value)).toThrow(
      "Personal feed configuration only supports RSS or Atom sources.",
    );
  });

  it("requires absolute path prefixes for web page sources", () => {
    expect(() =>
      parseIndustrySources(
        JSON.stringify([
          {
            type: "page",
            name: "Unsafe",
            url: "https://example.com/news",
            pathPrefixes: ["news/"],
          },
        ]),
      ),
    ).toThrow("Web page source pathPrefixes must contain absolute path prefixes.");
  });

  it("loads state and output options from args", () => {
    const config = loadConfig({}, [
      "--json",
      "--only-new",
      "--rss-only",
      "--state-file",
      ".state/test.json",
      "--run-log-dir",
      ".state/test-runs",
      "--dry-run",
    ]);

    expect(config.outputFormat).toBe("json");
    expect(config.onlyNew).toBe(true);
    expect(config.rssOnly).toBe(true);
    expect(config.stateFile).toBe(".state/test.json");
    expect(config.runLogDir).toBe(".state/test-runs");
  });

  it("loads a bounded paper research queue size", () => {
    expect(loadConfig({}, ["--dry-run"]).maxPapers).toBe(8);
    expect(loadConfig({ FEED_MAX_PAPERS: "5" }, ["--dry-run"]).maxPapers).toBe(5);
    expect(loadConfig({}, ["--max-papers", "3", "--dry-run"]).maxPapers).toBe(3);
    expect(loadConfig({ FEED_MAX_PAPERS: "50" }, ["--dry-run"]).maxPapers).toBe(8);
  });

  it("loads rss-only mode from env", () => {
    const config = loadConfig({ FEED_RSS_ONLY: "true" }, ["--dry-run"]);

    expect(config.rssOnly).toBe(true);
  });

  it("loads a calendar-day window from args", () => {
    const config = loadConfig({}, [
      "--day",
      "2026-06-27",
      "--timezone-offset",
      "+08:00",
      "--dry-run",
    ]);

    expect((config as { day?: string }).day).toBe("2026-06-27");
    expect((config as { timezoneOffset?: string }).timezoneOffset).toBe("+08:00");
  });

  it("loads an explicit window from args", () => {
    const config = loadConfig({}, [
      "--since",
      "2026-06-27T09:00:00+08:00",
      "--until",
      "2026-06-28T09:00:00+08:00",
      "--dry-run",
    ]);

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

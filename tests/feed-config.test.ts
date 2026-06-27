import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseFeedSubscriptions } from "../src/config.js";

describe("repository feed configuration", () => {
  it("tracks one shared feeds.json file", () => {
    expect(existsSync(new URL("../feeds.json", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../feeds.example.json", import.meta.url))).toBe(false);
    expect(readFileSync(new URL("../.gitignore", import.meta.url), "utf8")).not.toMatch(/^feeds\.json$/mu);
  });

  it("keeps the shared feed list parseable and deduplicated", () => {
    const feeds = parseFeedSubscriptions(readFileSync(new URL("../feeds.json", import.meta.url), "utf8"));
    const urls = feeds.map((feed) => feed.url);

    expect(feeds.length).toBeGreaterThan(0);
    expect(new Set(urls).size).toBe(urls.length);
    for (const feed of feeds) {
      expect(feed.name).not.toHaveLength(0);
      expect(feed.url).toMatch(/^https?:\/\//u);
    }
  });

  it("documents that feed additions and removals go through pull requests", () => {
    const skill = readFileSync(new URL("../skills/rss-feed-management/SKILL.md", import.meta.url), "utf8");

    expect(skill).toContain("Feed additions and removals both go through pull requests.");
  });
});

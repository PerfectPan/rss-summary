import { describe, expect, it, vi } from "vite-plus/test";

import { HackerNewsClient } from "../../src/infrastructure/hacker-news.js";

const fixture = {
  hits: [
    {
      objectID: "49132460",
      title: "RamenHaus",
      points: 146,
      num_comments: 40,
      created_at: "2026-08-01T08:48:58Z",
      author: "oler",
      url: "https://ramen.haus/",
      _tags: ["story", "author_oler", "story_49132460", "front_page"],
    },
    {
      objectID: "49132271",
      title: "Show HN: I built a TypeScript agent harness",
      points: 12,
      num_comments: 3,
      created_at: "2026-08-01T09:10:00Z",
      author: "builder",
      url: null,
      _tags: ["story", "show_hn", "author_builder", "story_49132271"],
    },
  ],
  nbHits: 2,
  hitsPerPage: 20,
};

describe("HackerNewsClient", () => {
  it("queries Algolia with OR tags, inclusive points, and optional created_at_i bounds", async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const parsed = new URL(String(url));
      expect(parsed.searchParams.get("tags")).toBe("(story,show_hn)");
      expect(parsed.searchParams.get("numericFilters")).toBe(
        "points>=80,created_at_i>=1722470400,created_at_i<1722556800",
      );
      expect(parsed.searchParams.get("hitsPerPage")).toBe("60");
      return new Response(JSON.stringify(fixture), { status: 200 });
    });

    const stories = await new HackerNewsClient({ fetch }).searchStories({
      minPoints: 80,
      includeShowHn: true,
      maxItems: 20,
      sinceUnix: 1_722_470_400,
      untilUnix: 1_722_556_800,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(stories).toHaveLength(2);
    expect(stories[0]).toMatchObject({
      id: "49132460",
      title: "RamenHaus",
      points: 146,
      numComments: 40,
      isShowHn: false,
      createdAt: "2026-08-01T08:48:58Z",
    });
    expect(stories[1]).toMatchObject({
      isShowHn: true,
      url: "https://news.ycombinator.com/item?id=49132271",
    });
  });

  it("uses the story tag only when Show HN is excluded", async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain("tags=story");
      expect(String(url)).not.toContain("show_hn");
      return new Response(JSON.stringify({ hits: [], nbHits: 0 }), { status: 200 });
    });

    await new HackerNewsClient({ fetch }).searchStories({
      minPoints: 80,
      includeShowHn: false,
      maxItems: 20,
    });
  });

  it("rejects non-OK responses and drops unparseable hits", async () => {
    const failing = new HackerNewsClient({
      fetch: async () => new Response("rate limited", { status: 429 }),
    });
    await expect(
      failing.searchStories({ minPoints: 80, includeShowHn: true, maxItems: 20 }),
    ).rejects.toThrow(/HTTP 429/);

    const partial = new HackerNewsClient({
      fetch: async () =>
        new Response(
          JSON.stringify({ hits: [{ title: "missing id" }, { objectID: "ok", title: "Fine" }] }),
          {
            status: 200,
          },
        ),
    });
    await expect(
      partial.searchStories({ minPoints: 80, includeShowHn: true, maxItems: 20 }),
    ).resolves.toHaveLength(1);
  });
});

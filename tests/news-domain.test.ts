import { describe, expect, it } from "vitest";

import { buildNewsStories, selectNewsStories } from "../src/news-domain.js";
import type { NewsSearchHit } from "../src/news-domain.js";
import type { NewsTopic } from "../src/news-topics.js";

describe("news domain", () => {
  it("deduplicates canonical URLs and boosts stories found by multiple queries", () => {
    const stories = buildNewsStories(
      [
        hit({
          id: "first",
          query: "AI Agent",
          url: "https://example.com/agent?utm_source=first",
          rankScore: 0.7,
        }),
        hit({
          id: "second",
          query: "开发工具",
          url: "https://example.com/agent?from=search",
          rankScore: 0.9,
        }),
        hit({ id: "other", query: "AI Agent", url: "https://example.com/other", rankScore: 0.95 }),
      ],
      {
        since: Date.parse("2026-07-29T00:00:00+08:00"),
        until: Date.parse("2026-07-29T12:30:00+08:00"),
      },
    );

    expect(stories).toHaveLength(2);
    expect(stories[0]).toMatchObject({
      canonicalUrl: "https://example.com/agent",
      queryHits: 2,
      topicIds: ["technology"],
    });
  });

  it("rejects stale, future, and insufficiently authoritative results", () => {
    const stories = buildNewsStories(
      [
        hit({ id: "stale", publishTime: "2026-07-28T23:59:59+08:00" }),
        hit({ id: "future", publishTime: "2026-07-29T12:31:00+08:00" }),
        hit({ id: "politics-low-quality", topicId: "politics", sourcePolicy: "official", authInfoLevel: 2 }),
        hit({ id: "politics-official", topicId: "politics", sourcePolicy: "official", authInfoLevel: 1 }),
      ],
      {
        since: Date.parse("2026-07-29T00:00:00+08:00"),
        until: Date.parse("2026-07-29T12:30:00+08:00"),
      },
    );

    expect(stories.map(({ id }) => id)).toEqual(["politics-official"]);
  });

  it("records the topic that selected a cross-topic story", () => {
    const stories = buildNewsStories(
      [
        hit({
          id: "politics",
          topicId: "politics",
          topicLabel: "政治新闻",
          sourcePolicy: "official",
          authInfoLevel: 1,
        }),
        hit({ id: "technology", topicId: "technology", topicLabel: "科技新闻" }),
      ],
      {
        since: Date.parse("2026-07-29T00:00:00+08:00"),
        until: Date.parse("2026-07-29T12:30:00+08:00"),
      },
    );

    const selected = selectNewsStories(stories, [
      topic({ id: "technology", label: "科技新闻" }),
      topic({ id: "politics", label: "政治新闻", sourcePolicy: "official" }),
    ]);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.selectedTopicId).toBe("technology");
  });
});

function topic(overrides: Partial<NewsTopic>): NewsTopic {
  return {
    id: "technology",
    label: "科技新闻",
    enabled: true,
    sourcePolicy: "authoritative",
    maxItems: 5,
    queries: ["科技新闻"],
    ...overrides,
  };
}

function hit(overrides: Partial<NewsSearchHit>): NewsSearchHit {
  return {
    id: "result",
    title: "Important update",
    url: "https://example.com/update",
    summary: "A bounded summary of the important update.",
    siteName: "Example News",
    publishTime: "2026-07-29T09:30:00+08:00",
    rankScore: 0.8,
    authInfoLevel: 2,
    authInfoDescription: "正常权威",
    topicId: "technology",
    topicLabel: "科技新闻",
    sourcePolicy: "authoritative",
    query: "AI Agent",
    ...overrides,
  };
}

import { describe, expect, it } from "vite-plus/test";

import {
  buildNewsStories,
  buildNewsStoriesWithAudit,
  selectNewsStories,
  selectNewsStoriesWithAudit,
  type NewsSearchHit,
  type NewsTopic,
  type NewsTopicQuery,
} from "../../src/domain/news.js";
import { parsePublishTime } from "../../src/domain/text.js";

const window = {
  since: Date.parse("2026-07-29T00:00:00+08:00"),
  until: Date.parse("2026-07-29T12:30:00+08:00"),
};

describe("news domain", () => {
  it("interprets timezone-free publisher timestamps in the configured news timezone", () => {
    expect(parsePublishTime("2026-07-29 09:30:00", "+08:00")).toBe(
      Date.parse("2026-07-29T09:30:00+08:00"),
    );
    expect(parsePublishTime("2026-07-29T09:30:00Z", "+08:00")).toBe(
      Date.parse("2026-07-29T09:30:00Z"),
    );
  });

  it("deduplicates canonical URLs and gives cross-query matches only a bounded tie-break", () => {
    const stories = buildNewsStories(
      [
        hit({
          id: "first",
          queryId: "agent-release",
          queryText: "AI Agent",
          url: "https://example.com/agent?utm_source=first",
          rankPosition: 2,
        }),
        hit({
          id: "second",
          queryId: "developer-change",
          queryText: "开发工具",
          url: "https://example.com/agent?from=search",
          rankPosition: 1,
        }),
        hit({ id: "other", url: "https://example.com/other", rankPosition: 1 }),
      ],
      window,
    );

    expect(stories).toHaveLength(2);
    expect(stories[0]).toMatchObject({
      canonicalUrl: "https://example.com/agent",
      queryHits: 2,
      topicIds: ["technology"],
      scoreBreakdown: { crossQuery: 2 },
    });
    expect(stories[0]!.score - stories[1]!.score).toBeLessThanOrEqual(4);
  });

  it("records deterministic rejection reasons for every quality gate", () => {
    const result = buildNewsStoriesWithAudit(
      [
        hit({ id: "missing", title: "  " }),
        hit({ id: "invalid-time", publishTime: "not-a-date" }),
        hit({ id: "stale", publishTime: "2026-07-28T23:59:59+08:00" }),
        hit({ id: "future", publishTime: "2026-07-29T12:31:00+08:00" }),
        hit({ id: "low-authority", sourcePolicy: "official", authInfoLevel: 2 }),
        hit({ id: "excluded", title: "新版本评测", excludedAny: ["评测"] }),
        hit({
          id: "off-topic",
          title: "普通行业观点",
          summary: "没有具体事件。",
          subjectAny: ["行业"],
        }),
        hit({ id: "bad-url", url: "not-a-url" }),
        hit({ id: "accepted", sourcePolicy: "official", authInfoLevel: 1 }),
      ],
      window,
    );

    expect(result.stories.map(({ id }) => id)).toEqual(["accepted"]);
    expect(result.decisions.map(({ reason }) => reason).filter(Boolean)).toEqual([
      "missing-fields",
      "invalid-publish-time",
      "outside-window",
      "outside-window",
      "insufficient-authority",
      "excluded-content",
      "intent-mismatch",
      "invalid-url",
    ]);
  });

  it("matches ASCII filter terms on token boundaries", () => {
    const result = buildNewsStoriesWithAudit(
      [
        hit({
          id: "preview",
          title: "Product enters public preview",
          summary: "The product is now available.",
          subjectAny: ["product"],
          eventAny: ["public preview"],
          excludedAny: ["review"],
        }),
      ],
      window,
    );

    expect(result.stories).toHaveLength(1);
    expect(result.decisions[0]).toMatchObject({ status: "accepted" });
  });

  it("accepts an official source name as subject evidence without treating it as noise", () => {
    const result = buildNewsStoriesWithAudit(
      [
        hit({
          id: "source-subject",
          title: "Introducing a new reasoning model",
          summary: "The model is available today.",
          siteName: "OpenAI Research",
          subjectAny: ["OpenAI"],
          eventAny: ["introducing"],
          excludedAny: ["review"],
        }),
      ],
      window,
    );

    expect(result.stories).toHaveLength(1);
  });

  it("deduplicates one event reported under different publisher URLs", () => {
    const stories = buildNewsStories(
      [
        hit({
          id: "apple-update-a",
          title: "苹果发布安全更新：一口气修复上百处安全隐患",
          url: "https://news.example.com/apple-security-update",
          rankPosition: 1,
        }),
        hit({
          id: "apple-update-b",
          title: "苹果用户注意！官方发布安全更新，修复上百处安全隐患",
          url: "https://publisher.example.net/apple-upgrade-warning",
          rankPosition: 2,
        }),
        hit({
          id: "qoder-team",
          title: "Qoder 正式发布团队协作产品",
          url: "https://news.example.com/qoder-team",
          rankPosition: 3,
        }),
      ],
      window,
    );

    const selection = selectNewsStoriesWithAudit(stories, [topic({ maxItems: 3 })]);

    expect(selection.stories.map(({ id }) => id)).toEqual(["apple-update-a", "qoder-team"]);
    expect(selection.decisions).toContainEqual(
      expect.objectContaining({
        story: expect.objectContaining({ id: "apple-update-b" }),
        status: "filtered",
        reason: "duplicate-title",
      }),
    );
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
      window,
    );

    const selected = selectNewsStories(stories, [
      topic({ id: "technology", label: "科技新闻" }),
      topic({ id: "politics", label: "政治新闻", sourcePolicy: "official" }),
    ]);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.selectedTopicId).toBe("technology");
  });

  it("caps a brief at eight stories even when custom topic quotas are larger", () => {
    const titles = [
      "Alpha runtime 正式发布",
      "Beta editor 正式发布",
      "Gamma database 正式发布",
      "Delta compiler 正式发布",
      "Epsilon cloud 正式发布",
      "Zeta framework 正式发布",
      "Eta protocol 正式发布",
      "Theta platform 正式发布",
      "Iota service 正式发布",
      "Kappa toolkit 正式发布",
    ];
    const stories = buildNewsStories(
      Array.from({ length: 10 }, (_, index) =>
        hit({
          id: `story-${index + 1}`,
          title: titles[index],
          url: `https://example.com/story-${index + 1}`,
          rankPosition: index + 1,
        }),
      ),
      window,
    );

    const selection = selectNewsStoriesWithAudit(stories, [topic({ maxItems: 10 })]);
    expect(selection.stories).toHaveLength(8);
    expect(selection.decisions.filter(({ reason }) => reason === "brief-cap")).toHaveLength(2);
  });
});

function topic(overrides: Partial<NewsTopic>): NewsTopic {
  return {
    id: "technology",
    label: "科技新闻",
    icon: "💻",
    enabled: true,
    sourcePolicy: "authoritative",
    maxItems: 5,
    queries: [query()],
    ...overrides,
  };
}

function query(overrides: Partial<NewsTopicQuery> = {}): NewsTopicQuery {
  return {
    id: "agent-release",
    text: "AI Agent 正式发布",
    intent: "model-release",
    subjectAny: ["AI Agent"],
    eventAny: ["正式发布"],
    excludedAny: ["评测"],
    ...overrides,
  };
}

function hit(overrides: Partial<NewsSearchHit>): NewsSearchHit {
  return {
    id: "result",
    title: "产品正式发布",
    url: "https://example.com/update",
    summary: "官方正式发布一项重要产品更新。",
    siteName: "Example News",
    publishTime: "2026-07-29T09:30:00+08:00",
    rankScore: 0.8,
    rankPosition: 1,
    authInfoLevel: 2,
    authInfoDescription: "正常权威",
    topicId: "technology",
    topicLabel: "科技新闻",
    sourcePolicy: "authoritative",
    queryId: "agent-release",
    queryText: "AI Agent 正式发布",
    subjectAny: ["产品"],
    eventAny: ["正式发布"],
    excludedAny: ["评测"],
    ...overrides,
  };
}

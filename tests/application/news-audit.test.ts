import { describe, expect, it } from "vite-plus/test";

import { buildNewsAudit, type NewsAuditRequest } from "../../src/application/news-audit.js";
import type {
  NewsHitDecision,
  NewsSearchHit,
  NewsStory,
  NewsStoryDecision,
} from "../../src/domain/news.js";

describe("news audit", () => {
  it("explains query failures and every stage of the selection funnel", () => {
    const requests = [request("working"), request("failed")];
    const decisions: NewsHitDecision[] = [
      ...Array.from({ length: 5 }, (_, index) => ({
        hit: hit(`accepted-${index + 1}`),
        status: "accepted" as const,
        canonicalUrl: `https://example.com/${index + 1}`,
      })),
      {
        hit: hit("rejected"),
        status: "rejected",
        reason: "intent-mismatch",
      },
    ];
    const storyDecisions: NewsStoryDecision[] = [
      { story: story("selected"), status: "selected" },
      { story: story("duplicate"), status: "filtered", reason: "duplicate-title" },
      { story: story("quota"), status: "filtered", reason: "topic-quota" },
      { story: story("cap"), status: "filtered", reason: "brief-cap" },
    ];
    const settled = [
      Promise.resolve({
        logId: "provider-log",
        resultCount: 8,
        results: decisions.map(({ hit: value }) => ({
          id: value.id,
          title: value.title,
          url: value.url,
          rankPosition: value.rankPosition,
        })),
      }),
      Promise.reject(new Error("search unavailable")),
    ];

    return Promise.allSettled(settled).then((results) => {
      const audit = buildNewsAudit(requests, results, decisions, storyDecisions, 4, 1);

      expect(audit.queries).toEqual([
        expect.objectContaining({
          queryId: "working",
          status: "ok",
          logId: "provider-log",
          reportedResultCount: 8,
          fetched: 6,
          accepted: 5,
          rejected: { "intent-mismatch": 1 },
        }),
        expect.objectContaining({
          queryId: "failed",
          status: "failed",
          error: "search unavailable",
        }),
      ]);
      expect(audit.counts).toEqual({
        fetched: 6,
        acceptedHits: 5,
        rejectedHits: 1,
        canonicalDuplicates: 1,
        deduplicatedStories: 4,
        selectedStories: 1,
        duplicateTitleStories: 1,
        topicQuotaFilteredStories: 1,
        briefCapFilteredStories: 1,
      });
    });
  });
});

function request(id: string): NewsAuditRequest {
  return {
    query: {
      id,
      text: `${id} query`,
      intent: "model-release",
      subjectAny: ["product"],
      eventAny: ["release"],
      excludedAny: [],
    },
    topic: {
      id: "technology",
      label: "科技",
      icon: "💻",
      enabled: true,
      sourcePolicy: "authoritative",
      maxItems: 2,
      queries: [],
    },
  };
}

function hit(id: string): NewsSearchHit {
  return {
    id,
    title: "Product release",
    url: `https://example.com/${id}`,
    publishTime: "2026-08-09T09:00:00+08:00",
    authInfoLevel: 2,
    topicId: "technology",
    topicLabel: "科技",
    sourcePolicy: "authoritative",
    queryId: "working",
    queryText: "working query",
    subjectAny: ["product"],
    eventAny: ["release"],
    excludedAny: [],
    rankPosition: 1,
  };
}

function story(id: string): NewsStory {
  return {
    id,
    title: `${id} story`,
    canonicalUrl: `https://example.com/${id}`,
    summary: "Summary.",
    siteName: "Example",
    publishTime: "2026-08-09T09:00:00+08:00",
    rankScore: 0.8,
    authInfoLevel: 2,
    topicIds: ["technology"],
    topicLabels: ["科技"],
    queryIds: ["working"],
    queries: ["working query"],
    queryHits: 1,
    scoreBreakdown: { rank: 16, authority: 8, freshness: 5, crossQuery: 0 },
    score: 29,
  };
}

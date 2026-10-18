import assert from "node:assert/strict";

import { describe, expect, it } from "vite-plus/test";

import {
  NewsSearchError,
  resolveNewsCredibility,
  type SearchSettlement,
} from "../../../src/acquisition/index.js";
import { projectNewsHit, publicationFitsWindow } from "../../../src/editorial/domain/news/news.js";
import {
  buildNewsStoriesWithAudit,
  selectNewsStoriesWithAudit,
  type NewsSearchHit,
} from "../../../src/editorial/index.js";
import {
  buildNewsAudit,
  summarizeNewsSources,
  type NewsTopic,
} from "../../../src/app/products/news/output.js";
import { newsPublicationRange } from "../../../src/kernel/publication.js";
import { resolveNewsEditionWindow } from "../../../src/app/products/news/flow.js";
import { doubaoPayload, NEWS_TOPICS } from "../../golden/fixtures.js";
import {
  buildNewsAudit as legacyAudit,
  summarizeNewsSources as legacySummarize,
} from "./legacy-news-audit.js";
import {
  buildNewsStoriesWithAudit as legacyBuild,
  selectNewsStoriesWithAudit as legacySelect,
  type NewsSearchHit as LegacyHit,
  type NewsStoryDecision as LegacyStoryDecision,
  type NewsTopic as LegacyTopic,
} from "./legacy-news.js";
import { newsPublicationRange as legacyRange } from "./legacy-news-time.js";

const WINDOW = {
  since: Date.parse("2026-07-29T00:00:00+08:00"),
  until: Date.parse("2026-07-29T12:30:00+08:00"),
  timezoneOffset: "+08:00",
};
const LEVELS = [1, 2, 3, 4, undefined] as const;
const POLICIES = ["news", "authoritative", "official"] as const;
const VERIFICATIONS = [
  undefined,
  { method: "article-read" as const, domain: "example.com", policy: "official" as const },
  { method: "article-read" as const, domain: "example.com", policy: "news" as const },
  { method: "configured-domain" as const, domain: "example.com", policy: "official" as const },
  { method: "configured-domain" as const, domain: "example.com", policy: "news" as const },
  { method: "configured-domain" as const, domain: "other.test", policy: "official" as const },
  { method: "configured-domain" as const, domain: "other.test", policy: "news" as const },
  { method: "configured-domain" as const, domain: "example.com", policy: "official" as const },
];
const TIMES = [
  "2026-07-29T09:30:00+08:00",
  "2026-07-29T00:00:00+08:00",
  "2026-07-28T23:59:59+08:00",
  "2026-07-29T12:30:00+08:00",
  "2026-07-29T12:29:59+08:00",
  "2026-07-29",
  "2026-07-28",
  "not-a-date",
];

let inputGroups = 0;

function same(actual: unknown, expected: unknown): void {
  assert.deepStrictEqual(actual, expected);
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]!;
}

function legacyHit(overrides: Partial<LegacyHit> = {}): LegacyHit {
  return {
    id: "result",
    title: "产品正式发布",
    url: "https://news.example.com/update",
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

function topic(overrides: Partial<LegacyTopic> = {}): LegacyTopic {
  return {
    id: "technology",
    label: "科技新闻",
    icon: "💻",
    enabled: true,
    sourcePolicy: "authoritative",
    maxItems: 5,
    queries: [
      {
        id: "agent-release",
        text: "AI Agent 正式发布",
        intent: "model-release",
        subjectAny: ["产品"],
        eventAny: ["正式发布"],
        excludedAny: ["评测"],
      },
    ],
    ...overrides,
  };
}

function mapHit(hit: LegacyHit): NewsSearchHit {
  return projectNewsHit(
    hit,
    {
      topicId: hit.topicId,
      topicLabel: hit.topicLabel,
      sourcePolicy: hit.sourcePolicy,
      queryId: hit.queryId,
      queryText: hit.queryText,
      subjectAny: hit.subjectAny,
      eventAny: hit.eventAny,
      excludedAny: hit.excludedAny,
    },
    resolveNewsCredibility({
      url: hit.url,
      authInfoLevel: hit.authInfoLevel,
      sourceVerification: hit.sourceVerification as
        | {
            method: "configured-domain" | "article-read";
            domain: string;
            policy: "official" | "news";
          }
        | undefined,
    }),
  );
}

function compareHits(
  hits: LegacyHit[],
  topics: LegacyTopic[] = [topic()],
  window: typeof WINDOW = WINDOW,
): void {
  inputGroups += 1;
  const previous = legacyBuild(hits, window);
  const next = buildNewsStoriesWithAudit(hits.map(mapHit), window);
  same(next.stories, previous.stories);
  same(
    next.decisions.map(({ status, reason, canonicalUrl, hit }) => ({
      status,
      reason,
      canonicalUrl,
      id: hit.id,
      url: hit.url,
      queryId: hit.queryId,
    })),
    previous.decisions.map(({ status, reason, canonicalUrl, hit }) => ({
      status,
      reason,
      canonicalUrl,
      id: hit.id,
      url: hit.url,
      queryId: hit.queryId,
    })),
  );
  const previousSelection = legacySelect(previous.stories, topics);
  const nextSelection = selectNewsStoriesWithAudit(next.stories, topics as NewsTopic[]);
  same(nextSelection.stories, previousSelection.stories);
  same(nextSelection.decisions.map(storyDecision), previousSelection.decisions.map(storyDecision));
  same(
    publicationFitsWindow(hits[0]?.publishTime, window),
    fitsLegacy(hits[0]?.publishTime, window),
  );
}

function storyDecision(decision: { status: string; reason?: string; story: { id: string } }): {
  status: string;
  reason?: string;
  id: string;
} {
  return { status: decision.status, reason: decision.reason, id: decision.story.id };
}

function fitsLegacy(
  publishedAt: string | undefined,
  window: { since: number; until: number; timezoneOffset?: string },
): boolean {
  const publication = legacyRange(publishedAt, window.timezoneOffset);
  return (
    publication !== undefined &&
    publication.since >= window.since &&
    publication.until <= window.until
  );
}

describe("news editorial parity", () => {
  it("matches the pre-move rules on fixtures, certificates, and seeded hits", () => {
    for (const value of [
      "2026-07-29",
      "2026-02-30",
      undefined,
      "2026-07-29T09:30:00+08:00",
      "not-a-date",
    ]) {
      inputGroups += 1;
      same(newsPublicationRange(value, "+08:00"), legacyRange(value, "+08:00"));
    }

    for (const edition of ["noon", "evening"] as const) {
      const resolved = resolveNewsEditionWindow(
        edition === "noon" ? "2026-08-16T04:00:00.000Z" : "2026-08-16T12:00:00.000Z",
        "+08:00",
        edition,
      );
      const payload = doubaoPayload(
        edition === "noon" ? "2026-08-16T02:00:00.000Z" : "2026-08-16T08:00:00.000Z",
      );
      compareHits([fixtureHit(payload)], NEWS_TOPICS as LegacyTopic[], {
        since: resolved.since,
        until: resolved.until,
        timezoneOffset: resolved.timezoneOffset,
      });
    }
    const catchUp = {
      since: Date.parse("2026-08-15T12:00:00.000Z"),
      until: Date.parse("2026-08-16T12:00:00.000Z"),
      timezoneOffset: "+08:00",
    };
    compareHits(
      [fixtureHit(doubaoPayload("2026-08-16T02:00:00.000Z"))],
      NEWS_TOPICS as LegacyTopic[],
      catchUp,
    );

    for (const authInfoLevel of LEVELS) {
      for (const sourceVerification of VERIFICATIONS) {
        for (const sourcePolicy of POLICIES) {
          compareHits([
            legacyHit({
              authInfoLevel,
              sourceVerification,
              sourcePolicy,
              url:
                sourceVerification?.domain === "example.com"
                  ? "https://news.example.com/update"
                  : "https://other.test/update",
            }),
          ]);
        }
      }
    }

    for (const publishTime of TIMES) {
      for (const sourcePolicy of POLICIES) {
        compareHits([legacyHit({ publishTime, sourcePolicy, authInfoLevel: 1 })]);
      }
    }

    compareHits([
      legacyHit({ id: "a", url: "https://example.com/story?utm_source=one", queryId: "q1" }),
      legacyHit({
        id: "b",
        url: "https://example.com/story?from=two",
        queryId: "q2",
        rankPosition: 2,
      }),
    ]);
    compareHits(
      [
        legacyHit({ id: "near", title: "苹果发布安全更新：一口气修复上百处安全隐患" }),
        legacyHit({
          id: "far",
          title: "苹果用户注意！官方发布安全更新，修复上百处安全隐患",
          url: "https://publisher.example.net/apple",
          rankPosition: 2,
        }),
      ],
      [topic({ maxItems: 2 })],
    );
    compareHits(
      Array.from({ length: 10 }, (_, index) =>
        legacyHit({
          id: `cap-${index}`,
          title: `Product ${index} 正式发布独立标题 ${index}`,
          url: `https://example.com/cap-${index}`,
          rankPosition: index + 1,
        }),
      ),
      [topic({ maxItems: 10 })],
    );
    compareHits(
      [
        legacyHit({ id: "quota-a", title: "Alpha runtime 正式发布", url: "https://example.com/a" }),
        legacyHit({ id: "quota-b", title: "Beta editor 正式发布", url: "https://example.com/b" }),
      ],
      [topic({ maxItems: 1 })],
    );

    const random = createRandom(0x5e5b);
    const titles = ["产品正式发布", "安全更新公告", "服务中断恢复", "政策发布说明", "融资完成披露"];
    for (let index = 0; index < 420; index += 1) {
      const count = 1 + Math.floor(random() * 4);
      const sharedUrl = random() < 0.2;
      compareHits(
        Array.from({ length: count }, (_, offset) =>
          legacyHit({
            id: `rand-${index}-${offset}`,
            title: pick(random, titles),
            url: sharedUrl
              ? "https://news.example.com/shared"
              : `https://news.example.com/${index}-${offset}`,
            publishTime: pick(random, TIMES),
            authInfoLevel: pick(random, LEVELS),
            sourceVerification: pick(random, VERIFICATIONS),
            sourcePolicy: pick(random, POLICIES),
            rankPosition: offset + 1,
            rankScore: random(),
            queryId: `query-${offset}`,
            subjectAny: random() < 0.85 ? ["产品"] : ["缺失主体"],
            eventAny: random() < 0.85 ? ["正式发布"] : ["missing-event"],
            excludedAny: random() < 0.1 ? ["正式发布"] : ["评测"],
            topicId: offset % 2 === 0 ? "technology" : "policy",
          }),
        ),
        [
          topic({ id: "technology", maxItems: 1 + Math.floor(random() * 3) }),
          topic({ id: "policy", label: "政策", enabled: random() < 0.8, maxItems: 1 }),
        ],
      );
    }

    compareAudits();
    expect(inputGroups).toBeGreaterThanOrEqual(500);
    expect(inputGroups).toBe(581);
  });
});

function fixtureHit(payload: string): LegacyHit {
  const record = JSON.parse(payload).Result.WebResults[0];
  const query = NEWS_TOPICS[0]!.queries[0]!;
  return legacyHit({
    id: record.Id,
    title: record.Title,
    url: record.Url,
    siteName: record.SiteName,
    summary: record.Summary,
    publishTime: record.PublishTime,
    rankScore: record.RankScore,
    authInfoDescription: record.AuthInfoDes,
    authInfoLevel: record.AuthInfoLevel,
    rankPosition: record.SortId,
    topicId: NEWS_TOPICS[0]!.id,
    topicLabel: NEWS_TOPICS[0]!.label,
    sourcePolicy: NEWS_TOPICS[0]!.sourcePolicy as LegacyHit["sourcePolicy"],
    queryId: query.id,
    queryText: query.text,
    subjectAny: query.subjectAny,
    eventAny: query.eventAny,
    excludedAny: query.excludedAny,
  });
}

function compareAudits(): void {
  const requests = [
    {
      query: topic().queries[0]!,
      topic: topic(),
      input: { query: "executed query" },
    },
    {
      query: { ...topic().queries[0]!, id: "second", text: "second query" },
      topic: topic({ id: "policy", label: "政策" }),
    },
  ];
  const page = {
    provider: "grok",
    logId: "log-1",
    resultCount: 2,
    results: [{ id: "1", title: "One", url: "https://example.com/1", rankPosition: 1 }],
    grok: { nativeTools: ["x_keyword_search"], rejectedResults: 0, nativeCallCount: 1 },
    searchUsage: {
      source: "cache" as const,
      fetchedAt: "2026-08-16T04:00:00.000Z",
      dailyUsed: 1,
      monthlyUsed: 1,
      dailyLimit: 14,
      monthlyLimit: 420,
    },
    fallback: {
      reason: "10406",
      searched: true,
      reads: 1,
      warnings: [],
      sources: ["example.com"],
      skippedSources: ["other.com"],
    },
  };
  const failures = [
    new NewsSearchError("query_deferred", "Query deferred by the per-run search limit."),
    new NewsSearchError("local_budget_exhausted", "budget"),
    new NewsSearchError("10406", "search unavailable"),
    new NewsSearchError("grok_timeout", "timed out", {
      grok: { nativeTools: ["x_keyword_search"], rejectedResults: 1 },
    }),
    new Error("plain failure"),
    "string failure",
  ];
  const batches = [
    [page, page],
    [failures[0], failures[1]],
    [failures[2], page],
    [failures[3], failures[4]],
    [failures[5], failures[2]],
  ];
  const legacyDecisions = [
    {
      hit: legacyHit({ queryId: "agent-release" }),
      status: "accepted" as const,
      canonicalUrl: "https://example.com/update",
    },
    {
      hit: legacyHit({ id: "rejected", queryId: "agent-release" }),
      status: "rejected" as const,
      reason: "intent-mismatch" as const,
    },
  ];
  const decisions = legacyDecisions.map((decision) => ({ ...decision, hit: mapHit(decision.hit) }));
  const story: LegacyStoryDecision = {
    story: legacyBuild([legacyHit()], WINDOW).stories[0]!,
    status: "filtered",
    reason: "duplicate-title",
  };
  for (const batch of batches) {
    inputGroups += 1;
    const legacySettled = batch.map((entry) =>
      entry && typeof entry === "object" && "resultCount" in entry
        ? { status: "fulfilled" as const, value: entry }
        : { status: "rejected" as const, reason: entry },
    );
    const settled: SearchSettlement[] = batch.map((entry) =>
      entry && typeof entry === "object" && "resultCount" in entry
        ? { _tag: "Fulfilled", value: entry }
        : { _tag: "Rejected", reason: entry },
    );
    same(
      buildNewsAudit(requests, settled, decisions, [story], 1, 0),
      legacyAudit(requests, legacySettled, legacyDecisions, [story], 1, 0),
    );
    same(summarizeNewsSources(requests, settled), legacySummarize(requests, legacySettled));
  }
}

import assert from "node:assert/strict";

import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import {
  acquireWebPage,
  normalizeEvent,
  parseFeedXml,
  projectActivity,
  repositoryMetadata,
  type ActivityCardDto,
  type RepositoryMetadata,
} from "../../../src/acquisition/index.js";
import {
  buildDailyAiDigest,
  buildSubscriptionEvidence,
  candidateDecision,
  candidateIdentity,
  presentationDecisionForCandidate,
  researchKeyForCandidate,
  scoreAcquired,
  selectResearchCandidates,
  validateEditorialDraft,
  validateSubscriptionEditorialDraft,
  validateSubscriptionResearch,
  validateSubscriptionSelectionDraft,
  type CandidateProject,
  type DigestDocument,
} from "../../../src/editorial/index.js";
import {
  FROZEN_NOW,
  GITHUB_REPOSITORY,
  GITHUB_WATCH_EVENT,
  INDUSTRY_ATOM,
  INDUSTRY_FEED_URL,
  INDUSTRY_PAGE_HTML,
  INDUSTRY_PAGE_URL,
  PERSONAL_FEED_URL,
  PERSONAL_RSS,
} from "../../golden/fixtures.js";
import { presentationDecisionForCandidate as legacyPresentation } from "./legacy-attention.js";
import {
  buildDailyAiDigest as legacyDaily,
  validateEditorialDraft as legacyValidateDaily,
} from "./legacy-daily-ai.js";
import {
  buildCandidateProjects as legacyBuild,
  candidateIdentity as legacyIdentity,
  researchKeyForCandidate as legacyResearch,
  selectResearchCandidates as legacySelect,
} from "./legacy-digest.js";
import { candidateDecision as legacyDecision } from "./legacy-run-audit.js";
import {
  buildSubscriptionEvidence as legacyEvidence,
  validateSubscriptionEditorialDraft as legacyValidateDraft,
  validateSubscriptionResearch as legacyValidateResearch,
  validateSubscriptionSelectionDraft as legacyValidateSelection,
} from "./legacy-subscription-editorial.js";

const BOUNDARY = "2026-08-02T04:00:00.000Z";
const JUST_STALE = "2026-08-02T03:59:59.000Z";
const INTERESTS = ["rustlang", "topicword", "descword", "compiler", "abstractterm"];
const KEYWORDS = [
  "安全漏洞",
  "CVE-2024-12345",
  "major outage",
  "breaking change",
  "deprecation",
  "major release",
];
const ACTIVITY_TYPES = [
  "watch",
  "trending",
  "recommendation",
  "announcement",
  "release",
  "fork",
  "create",
  "follow",
  "article",
  "paper",
  "pull_request",
] as const;
const PULL_ACTIONS = ["merged", "opened", "closed", "labeled", undefined] as const;

type Context = {
  followees: Set<string>;
  interests: string[];
  repositories: Map<string, RepositoryMetadata>;
};

let inputGroups = 0;

function same(actual: unknown, expected: unknown): void {
  assert.deepStrictEqual(actual, expected);
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
}

function scoreBoth(events: ActivityCardDto[], context: Context): CandidateProject[] {
  inputGroups += 1;
  const previous = legacyBuild(events, context);
  const next = scoreAcquired(
    events.map((event) =>
      projectActivity(event, {
        followees: context.followees,
        repositories: context.repositories,
      }),
    ),
    { interests: context.interests, now: Date.now() },
  );
  same(next, previous);
  same(selectResearchCandidates(next, 1), legacySelect(previous, 1));
  same(selectResearchCandidates(next, 8), legacySelect(previous, 8));
  for (const [index, candidate] of previous.entries()) {
    const updated = next[index]!;
    expect(candidateIdentity(candidate)).toBe(legacyIdentity(candidate));
    expect(candidateIdentity(updated)).toBe(legacyIdentity(updated));
    expect(researchKeyForCandidate(candidate)).toBe(legacyResearch(candidate));
    expect(researchKeyForCandidate(updated)).toBe(legacyResearch(updated));
    for (const policy of [{}, { semanticSummaries: true }] as const) {
      same(
        presentationDecisionForCandidate(candidate, policy),
        legacyPresentation(candidate, policy),
      );
      same(presentationDecisionForCandidate(updated, policy), legacyPresentation(updated, policy));
    }
    const reason = () => "not selected";
    same(
      candidateDecision(updated, next, reason, { semanticSummaries: true }),
      legacyDecision(candidate, previous, reason, { semanticSummaries: true }),
    );
  }
  return next;
}

function card(
  overrides: Partial<ActivityCardDto> & Pick<ActivityCardDto, "id" | "type">,
): ActivityCardDto {
  return {
    actor: "someone",
    repo: "example/repo",
    createdAt: "2026-08-15T02:00:00.000Z",
    ...overrides,
  };
}

function repository(
  name: string,
  stars: number,
  pushedAt: string | null,
  extra: { description?: string; language?: string | null; topics?: string[] } = {},
): RepositoryMetadata {
  return {
    fullName: name,
    htmlUrl: `https://github.com/${name}`,
    description: extra.description ?? null,
    language: extra.language === undefined ? null : extra.language,
    stargazersCount: stars,
    topics: extra.topics ?? [],
    pushedAt,
  };
}

function contextFor(
  repoName: string,
  options: {
    followees?: string[];
    interests?: string[];
    repository?: RepositoryMetadata;
  } = {},
): Context {
  return {
    followees: new Set(options.followees ?? []),
    interests: options.interests ?? [],
    repositories: new Map(options.repository ? [[repoName, options.repository]] : []),
  };
}

function errorShape(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  const extra = error as Error & { code?: string; issues?: unknown };
  return { name: extra.name, message: extra.message, code: extra.code, issues: extra.issues };
}

function samePair(previousRun: () => unknown, nextRun: () => unknown): void {
  inputGroups += 1;
  let previous: unknown;
  let next: unknown;
  let previousError: unknown;
  let nextError: unknown;
  try {
    previous = previousRun();
  } catch (error) {
    previousError = error;
  }
  try {
    next = nextRun();
  } catch (error) {
    nextError = error;
  }
  same(errorShape(nextError), errorShape(previousError));
  if (previousError === undefined && nextError === undefined) same(next, previous);
}

describe("editorial oracle parity", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(FROZEN_NOW));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("matches the oracle on golden fixtures, fixed sweeps, and 500 seeded groups", () => {
    const frozenNow = new Date(FROZEN_NOW);
    const personal = parseFeedXml(
      PERSONAL_RSS,
      { name: "Example Feed", url: PERSONAL_FEED_URL, tags: ["typescript"] },
      frozenNow,
    );
    const industry = parseFeedXml(
      INDUSTRY_ATOM,
      { name: "Industry", url: INDUSTRY_FEED_URL, tags: ["typescript"] },
      frozenNow,
    );
    const page = acquireWebPage(INDUSTRY_PAGE_HTML, {
      type: "page",
      name: "Anthropic News",
      url: INDUSTRY_PAGE_URL,
      pathPrefixes: ["/news/"],
      tags: ["News"],
    }).map((entry) => entry.card);
    const watch = normalizeEvent(GITHUB_WATCH_EVENT);
    const watchedRepo = repositoryMetadata(GITHUB_REPOSITORY);
    scoreBoth(personal, contextFor(personal[0]?.repo ?? "", { interests: INTERESTS }));
    scoreBoth(industry, contextFor(industry[0]?.repo ?? "", { interests: INTERESTS }));
    scoreBoth(page, contextFor(page[0]?.repo ?? "", { interests: INTERESTS }));
    scoreBoth(
      [watch],
      contextFor(watch.repo, {
        followees: ["alice"],
        interests: INTERESTS,
        repository: watchedRepo,
      }),
    );

    const at = "2026-08-15T02:00:00.000Z";
    const matrixRepos = new Map<string, RepositoryMetadata>([
      [
        "alpha/watch-one",
        repository("alpha/watch-one", 1_000, "2026-08-15T00:00:00.000Z", { language: "RustLang" }),
      ],
      ["alpha/watch-many", repository("alpha/watch-many", 10, "2026-07-01T00:00:00.000Z")],
      ["alpha/watch-stranger", repository("alpha/watch-stranger", 10, "2026-07-01T00:00:00.000Z")],
      [
        "alpha/watch-topic",
        repository("alpha/watch-topic", 10, "2026-07-01T00:00:00.000Z", { topics: ["topicword"] }),
      ],
      [
        "alpha/watch-desc",
        repository("alpha/watch-desc", 10, "2026-07-01T00:00:00.000Z", {
          description: "A descword project",
        }),
      ],
      ["beta/release", repository("beta/release", 100_000_000, BOUNDARY)],
      ["beta/release-stale", repository("beta/release-stale", 1_000, JUST_STALE)],
      ["gamma/fork", repository("gamma/fork", 1, "2026-07-01T00:00:00.000Z")],
      ["gamma/create", repository("gamma/create", 1, "2026-07-01T00:00:00.000Z")],
      [
        "delta/merged",
        repository("delta/merged", 10, "2026-07-01T00:00:00.000Z", { language: "Go" }),
      ],
      [
        "delta/opened",
        repository("delta/opened", 10, "2026-07-01T00:00:00.000Z", { language: "Go" }),
      ],
      [
        "delta/closed",
        repository("delta/closed", 10, "2026-07-01T00:00:00.000Z", { language: "Go" }),
      ],
      [
        "delta/labeled",
        repository("delta/labeled", 10, "2026-07-01T00:00:00.000Z", { language: "Go" }),
      ],
    ]);
    const pulls: Record<string, { title: string; body: string }> = {
      "delta/merged#1": { title: "Compiler pipeline tweak", body: "Adjusts the pipeline." },
      "delta/opened#2": { title: "Rename helper", body: "Renames an internal helper." },
      "delta/closed#3": { title: "Drop flag", body: "Removes an unused flag." },
      "delta/labeled#4": { title: "Chore", body: "Updates a comment." },
    };
    const matrixEvents = [
      ...[
        ["1001", "alice", "alpha/watch-one"],
        ["1002", "alice", "alpha/watch-many"],
        ["1003", "bob", "alpha/watch-many"],
        ["1004", "dave", "alpha/watch-stranger"],
        ["1005", "dave", "alpha/watch-topic"],
        ["1006", "dave", "alpha/watch-desc"],
      ].map(([id, actor, name]) =>
        normalizeEvent({
          id,
          type: "WatchEvent",
          actor: { login: actor },
          repo: { name },
          created_at: at,
          payload: { action: "started" },
        }),
      ),
      ...["beta/release", "beta/release-stale"].map((name, index) =>
        normalizeEvent({
          id: `200${index + 1}`,
          type: "ReleaseEvent",
          actor: { login: "dave" },
          repo: { name },
          created_at: at,
          payload: {
            action: "published",
            release: {
              name: "v1",
              tag_name: "v1",
              html_url: `https://github.com/${name}/releases/v1`,
              body: "Release notes",
            },
          },
        }),
      ),
      normalizeEvent({
        id: "3001",
        type: "ForkEvent",
        actor: { login: "alice" },
        repo: { name: "gamma/fork" },
        created_at: at,
        payload: {},
      }),
      normalizeEvent({
        id: "3002",
        type: "CreateEvent",
        actor: { login: "dave" },
        repo: { name: "gamma/create" },
        created_at: at,
        payload: { ref_type: "repository" },
      }),
      ...[
        ["4001", "delta/merged", "merged", 1],
        ["4002", "delta/opened", "opened", 2],
        ["4003", "delta/closed", "closed", 3],
        ["4004", "delta/labeled", "labeled", 4],
      ].map(([id, name, action, number]) => {
        const event = normalizeEvent({
          id,
          type: "PullRequestEvent",
          actor: { login: "dave" },
          repo: { name },
          created_at: at,
          payload: {
            action,
            number,
            pull_request: {
              title: "placeholder",
              html_url: `https://github.com/${name}/pull/${number}`,
              body: "placeholder",
            },
          },
        });
        const body = pulls[`${name}#${number}`]!;
        event.title = body.title;
        event.htmlUrl = `https://github.com/${name}/pull/${number}`;
        event.summary = body.body;
        return event;
      }),
      ...parseFeedXml(
        compilerFeed,
        { name: "Compiler Notes", url: "https://example.com/compiler.xml", tags: ["notes"] },
        frozenNow,
      ),
      ...parseFeedXml(
        weeklyFeed,
        { name: "Weekly Notes", url: "https://example.com/weekly.xml", tags: ["notes"] },
        frozenNow,
      ),
      ...parseFeedXml(
        paperFeed,
        { name: "Paper Feed", url: "https://example.com/papers.xml", tags: ["papers"] },
        frozenNow,
      ),
    ];
    scoreBoth(matrixEvents, {
      followees: new Set(["alice", "bob"]),
      interests: INTERESTS,
      repositories: matrixRepos,
    });

    for (const type of ACTIVITY_TYPES) {
      for (const follow of [false, true]) {
        const event = card({
          id: `${type}-${follow}`,
          type,
          actor: follow ? "alice" : "dave",
          ...(type === "article" || type === "paper"
            ? { source: "rss" as const, sourceName: "Feed", summary: "plain body" }
            : {}),
          ...(type === "pull_request" ? { action: "opened", prNumber: 4, title: "Change" } : {}),
        });
        scoreBoth([event], contextFor(event.repo, { followees: follow ? ["alice"] : [] }));
      }
    }
    for (const action of PULL_ACTIONS) {
      const event = card({
        id: `pr-${action ?? "none"}`,
        type: "pull_request",
        prNumber: 9,
        ...(action ? { action } : {}),
      });
      scoreBoth([event], contextFor(event.repo));
    }
    for (const stars of [0, 1, 1_000, 100_000_000]) {
      const event = card({ id: `stars-${stars}`, type: "watch" });
      scoreBoth(
        [event],
        contextFor(event.repo, { repository: repository(event.repo, stars, null) }),
      );
    }
    for (const pushedAt of [BOUNDARY, JUST_STALE, null]) {
      const event = card({ id: `push-${pushedAt}`, type: "watch" });
      scoreBoth(
        [event],
        contextFor(event.repo, { repository: repository(event.repo, 10, pushedAt) }),
      );
    }
    scoreBoth(
      [card({ id: "lang", type: "watch" })],
      contextFor("example/repo", {
        interests: ["rustlang"],
        repository: repository("example/repo", 1, null, { language: "RustLang" }),
      }),
    );
    scoreBoth(
      [card({ id: "topic", type: "watch" })],
      contextFor("example/repo", {
        interests: ["topicword"],
        repository: repository("example/repo", 1, null, { topics: ["topicword"] }),
      }),
    );
    scoreBoth(
      [card({ id: "desc", type: "watch" })],
      contextFor("example/repo", {
        interests: ["descword"],
        repository: repository("example/repo", 1, null, { description: "A descword project" }),
      }),
    );
    scoreBoth(
      [
        card({
          id: "event-interest",
          type: "article",
          source: "rss",
          title: "Compiler notes",
          summary: "No other overlap.",
          sourceName: "Notes",
        }),
      ],
      contextFor("example/repo", { interests: ["compiler"] }),
    );
    scoreBoth(
      [
        card({
          id: "paper-abstract",
          type: "paper",
          source: "rss",
          title: "Unrelated title",
          summary: "The abstract covers abstractterm.",
          sourceName: "Papers",
        }),
      ],
      contextFor("example/repo", { interests: ["abstractterm"] }),
    );
    scoreBoth(
      [
        card({
          id: "paper-title",
          type: "paper",
          source: "rss",
          title: "Notes on abstractterm",
          summary: "Nothing relevant in the body.",
          sourceName: "Papers",
        }),
      ],
      contextFor("example/repo", { interests: ["abstractterm"] }),
    );
    scoreBoth(
      [
        card({ id: "actor-a", type: "watch", actor: "alice" }),
        card({ id: "actor-b", type: "watch", actor: "bob", createdAt: "2026-08-15T03:00:00.000Z" }),
      ],
      contextFor("example/repo"),
    );
    scoreBoth(
      [card({ id: "blank-actor", type: "watch", actor: "" })],
      contextFor("example/repo", { followees: [""] }),
    );
    scoreBoth(
      [
        card({
          id: "web-article",
          type: "article",
          source: "web",
          title: "Site note",
          htmlUrl: "https://example.com/site",
          sourceName: "Site",
        }),
      ],
      contextFor("web:example"),
    );
    scoreBoth(
      [
        card({
          id: "paper-web",
          type: "paper",
          source: "web",
          title: "Web paper",
          summary: "abstractterm appears here",
          htmlUrl: "https://example.com/paper",
        }),
      ],
      contextFor("web:paper", { interests: ["abstractterm"] }),
    );
    scoreBoth(
      [
        card({
          id: "paper-unscoped",
          type: "paper",
          title: "No source",
          summary: "abstractterm in abstract",
          htmlUrl: "https://example.com/unscoped",
        }),
      ],
      contextFor("example/paper", { interests: ["abstractterm"] }),
    );
    scoreBoth(
      [
        card({
          id: "rss-release",
          type: "release",
          source: "rss",
          title: "Feed release",
          htmlUrl: "https://example.com/release",
        }),
      ],
      contextFor("rss:release"),
    );
    for (const keyword of KEYWORDS) {
      scoreBoth(
        [card({ id: `keyword-${keyword}`, type: "release", title: keyword, summary: keyword })],
        contextFor("example/repo"),
      );
    }

    const rand = mulberry32(0x5eed_0816);
    for (let index = 0; index < 500; index += 1) {
      const type = ACTIVITY_TYPES[index % ACTIVITY_TYPES.length]!;
      const action = PULL_ACTIONS[index % PULL_ACTIONS.length];
      const stars = [0, 1, 10, 1_000, 100_000_000][index % 5]!;
      const pushedAt = [BOUNDARY, JUST_STALE, null, "2026-08-15T00:00:00.000Z"][index % 4] ?? null;
      const actor = index % 17 === 0 ? "" : index % 2 === 0 ? "alice" : "dave";
      const source =
        type === "paper" && index % 5 === 0
          ? undefined
          : type === "article" || type === "paper"
            ? index % 2 === 0
              ? "rss"
              : "web"
            : index % 19 === 0
              ? "web"
              : undefined;
      const keyword = index % 11 === 0 ? KEYWORDS[index % KEYWORDS.length] : undefined;
      const repoName = `owner/repo-${index % 13}`;
      const createdAt = new Date(
        Date.parse("2026-08-15T00:00:00.000Z") + index * 1000,
      ).toISOString();
      const summary =
        type === "paper"
          ? index % 2 === 0
            ? "The abstract covers abstractterm."
            : "Nothing relevant in the body."
          : (keyword ?? "Routine update");
      const primary = card({
        id: `rand-${index}`,
        type,
        actor,
        repo: repoName,
        createdAt,
        ...(source ? { source } : {}),
        ...(type === "article" || type === "paper" ? { sourceName: "Feed" } : {}),
        ...(type === "pull_request"
          ? {
              prNumber: (index % 20) + 1,
              ...(action ? { action } : {}),
              title: keyword ?? "Change",
            }
          : {}),
        title:
          type === "paper" && index % 2 === 1
            ? "Notes on abstractterm"
            : (keyword ?? `Update ${index}`),
        summary,
        htmlUrl: `https://example.com/${index}`,
        tags: rand() > 0.5 ? ["topicword"] : ["notes"],
      });
      const events = [primary];
      if (index % 4 === 0) {
        events.push(
          card({
            id: `rand-${index}-b`,
            type: "watch",
            actor: "bob",
            repo: repoName,
            createdAt: new Date(Date.parse(createdAt) + 60_000).toISOString(),
          }),
        );
      }
      scoreBoth(
        events,
        contextFor(repoName, {
          followees: index % 2 === 0 ? [actor] : ["alice"],
          interests: index % 3 === 0 ? INTERESTS : ["compiler"],
          repository: repository(repoName, stars, pushedAt, {
            language: index % 6 === 0 ? "RustLang" : null,
            topics: index % 3 === 0 ? ["topicword"] : [],
            description: index % 7 === 0 ? "A descword project" : "plain",
          }),
        }),
      );
    }

    const article = scoreBoth(
      [
        card({
          id: "draft-article",
          type: "article",
          source: "rss",
          actor: "Example",
          repo: "rss:https://example.com/post",
          title: "Draft title",
          summary: "正文包含数字 12 和足够的说明。",
          htmlUrl: "https://example.com/post",
          sourceName: "Example",
        }),
      ],
      contextFor("rss:https://example.com/post"),
    );
    const document = {
      generatedAt: FROZEN_NOW,
      username: "ada",
      candidates: article,
    } as DigestDocument;
    inputGroups += 1;
    same(buildSubscriptionEvidence(document), legacyEvidence(document));
    const evidence = buildSubscriptionEvidence(document);
    const ref = evidence[0]?.id ?? "";
    const legal = [{ ref, summary: "正文包含数字 12 和足够说明" }];
    const drafts: unknown[] = [
      legal,
      [{ ref, summary: "太短" }],
      [{ ref, summary: "够长的摘要" }],
      [{ ref, summary: "甲".repeat(180) }],
      [{ ref, summary: "甲".repeat(181) }],
      [{ ref, summary: "沿用上游的 12 这个数字说明" }],
      [{ ref, summary: "新增了 999 这个没有来源的数字" }],
      [{ ref: "missing", summary: "这是一条未知引用的摘要" }],
      [legal[0], legal[0]],
      "not-an-array",
      [{ summary: "没有引用的摘要内容" }],
    ];
    for (const draft of drafts) {
      samePair(
        () => legacyValidateDraft(draft, evidence),
        () => validateSubscriptionEditorialDraft(draft, evidence),
      );
    }
    const selected = [{ ref, selected: true, reason: "值得推送" }];
    samePair(
      () => legacyValidateSelection(selected, evidence),
      () => validateSubscriptionSelectionDraft(selected, evidence),
    );
    samePair(
      () => legacyValidateSelection([], evidence),
      () => validateSubscriptionSelectionDraft([], evidence),
    );
    const researchOk = [
      { ref, url: evidence[0]?.url, status: "ok", content: "x".repeat(80), title: "Fetched" },
    ];
    const researchShort = [{ ref, url: evidence[0]?.url, status: "ok", content: "short" }];
    samePair(
      () => legacyValidateResearch(researchOk, evidence),
      () => validateSubscriptionResearch(researchOk, evidence),
    );
    samePair(
      () => legacyValidateResearch(researchShort, evidence),
      () => validateSubscriptionResearch(researchShort, evidence),
    );

    const dailyEvidence = [
      {
        id: "daily-1",
        title: "Same Title",
        url: "https://example.com/daily",
        publishedAt: FROZEN_NOW,
        excerpt: "Body",
        tier: "official" as const,
        sourceName: "Official",
      },
      {
        id: "daily-2",
        title: "same   title",
        url: "https://example.com/other",
        publishedAt: FROZEN_NOW,
        excerpt: "Other",
        tier: "unverified" as const,
        sourceName: "Other",
      },
    ];
    const dailyDrafts: unknown[] = [
      [{ category: "模型发布", headline: "甲".repeat(90), refs: ["daily-1"] }],
      [{ category: "模型发布", headline: "甲".repeat(91), refs: ["daily-1"] }],
      [],
      [{ category: "不存在", headline: "一条合法长度的标题", refs: ["daily-1"] }],
      [{ category: "行业动态", headline: "未知引用的标题内容", refs: ["missing"] }],
      [
        { category: "技术与洞察", headline: "Same Title", refs: ["daily-1"] },
        { category: "开发生态", headline: "same title", refs: ["daily-2"] },
      ],
      "nope",
    ];
    for (const draft of dailyDrafts) {
      samePair(
        () => legacyDaily(dailyEvidence, { draft }),
        () => buildDailyAiDigest(dailyEvidence, { draft }),
      );
      samePair(
        () => legacyValidateDaily(draft, dailyEvidence),
        () => validateEditorialDraft(draft, dailyEvidence),
      );
    }

    expect(inputGroups).toBe(588);
    expect(inputGroups).toBeGreaterThanOrEqual(500);
  });
});

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function feed(name: string, link: string, title: string, description: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${name}</title><item><title>${title}</title><link>${link}</link><guid>${link}</guid><pubDate>Sat, 15 Aug 2026 02:00:00 GMT</pubDate><description>${description}</description></item></channel></rss>`;
}

const compilerFeed = feed(
  "Compiler Notes",
  "https://example.com/compiler-item",
  "Compiler notes for agents",
  "A note about the pipeline.",
);
const weeklyFeed = feed(
  "Weekly Notes",
  "https://example.com/weekly-item",
  "Weekly notes",
  "A routine weekly note.",
);
const paperFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Paper Feed</title>
<item><title>Unrelated title</title><link>https://example.com/paper-abstract</link><guid>https://example.com/paper-abstract</guid><pubDate>Sat, 15 Aug 2026 02:00:00 GMT</pubDate><description>The abstract covers abstractterm.</description></item>
<item><title>Notes on abstractterm</title><link>https://example.com/paper-title</link><guid>https://example.com/paper-title</guid><pubDate>Sat, 15 Aug 2026 02:00:00 GMT</pubDate><description>Nothing relevant in the body.</description></item>
</channel></rss>`;

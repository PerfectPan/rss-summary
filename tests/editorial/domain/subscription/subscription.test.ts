import { describe, expect, it, vi } from "vite-plus/test";

import {
  projectActivity,
  type ActivityCardDto,
  type RepositoryMetadata,
} from "../../../../src/acquisition/index.js";
import { normalizeEvent } from "../../../../src/acquisition/domain/item/adapters/github-event.js";
import {
  candidateIdentity,
  markCandidateResearched,
  presentationDecisionForCandidate,
  presentationDepthForCandidate,
  researchKeyForCandidate,
  scoreAcquired,
  selectResearchCandidates,
  type CandidateProject,
} from "../../../../src/editorial/index.js";
import {
  createEmptyFeedState,
  filterUndelivered,
  filterUnresearched,
} from "../../../../src/delivery/index.js";

function buildCandidateProjects(
  events: ActivityCardDto[],
  context: {
    followees: Set<string>;
    interests: string[];
    repositories: Map<string, RepositoryMetadata>;
  },
): CandidateProject[] {
  return scoreAcquired(
    events.map((event) =>
      projectActivity(event, {
        followees: context.followees,
        repositories: context.repositories,
      }),
    ),
    { interests: context.interests, now: Date.now() },
  );
}

describe("github feed domain", () => {
  it("normalizes a merged pull request event into an activity card", () => {
    const card = normalizeEvent({
      id: "10883496662",
      type: "PullRequestEvent",
      actor: { login: "bartlomieju" },
      repo: { name: "denoland/deno" },
      created_at: "2026-06-22T09:48:29Z",
      payload: {
        action: "merged",
        number: 35406,
        pull_request: {
          url: "https://api.github.com/repos/denoland/deno/pulls/35406",
        },
      },
    });

    expect(card).toEqual({
      id: "10883496662",
      type: "pull_request",
      actor: "bartlomieju",
      repo: "denoland/deno",
      createdAt: "2026-06-22T09:48:29Z",
      action: "merged",
      prNumber: 35406,
      detailUrl: "https://api.github.com/repos/denoland/deno/pulls/35406",
    });
  });

  it("prioritizes project discovery from a followee star over routine PR activity", () => {
    const candidates = buildCandidateProjects(
      [
        {
          id: "star-1",
          type: "watch",
          actor: "fi3ework",
          repo: "BuilderIO/skills",
          createdAt: "2026-06-22T09:47:11Z",
          action: "started",
        },
        {
          id: "pr-1",
          type: "pull_request",
          actor: "someone",
          repo: "example/noisy",
          createdAt: "2026-06-22T09:40:00Z",
          action: "labeled",
          prNumber: 1,
        },
      ],
      {
        followees: new Set(["fi3ework"]),
        interests: ["agent", "skills"],
        repositories: new Map([
          [
            "BuilderIO/skills",
            {
              fullName: "BuilderIO/skills",
              htmlUrl: "https://github.com/BuilderIO/skills",
              description: "Skills for coding agents",
              language: "JavaScript",
              stargazersCount: 2389,
              topics: ["skills"],
              pushedAt: "2026-06-22T02:55:49Z",
            },
          ],
        ]),
      },
    );

    expect(candidates[0]?.repo).toBe("BuilderIO/skills");
    expect(candidates[0]?.category).toBe("discovery");
    expect(candidates[0]?.score).toBeGreaterThan(candidates[1]?.score ?? 0);
    expect(candidates[0]?.reasons).toContain("followee starred this repository");
  });

  it("keeps pull requests distinct from repository discovery and from each other", () => {
    const candidates = buildCandidateProjects(
      [
        {
          id: "star-1",
          type: "watch",
          actor: "alice",
          repo: "example/project",
          createdAt: "2026-08-15T09:00:00Z",
        },
        {
          id: "pr-41",
          type: "pull_request",
          actor: "bob",
          repo: "example/project",
          createdAt: "2026-08-15T10:00:00Z",
          action: "opened",
          prNumber: 41,
          title: "Add resumable uploads",
          summary: "Adds checkpointed upload state so interrupted transfers can resume.",
          htmlUrl: "https://github.com/example/project/pull/41",
        },
        {
          id: "pr-42",
          type: "pull_request",
          actor: "carol",
          repo: "example/project",
          createdAt: "2026-08-15T11:00:00Z",
          action: "merged",
          prNumber: 42,
          title: "Bound retry backoff",
          summary: "Caps retry delays and reports the final failure reason.",
          htmlUrl: "https://github.com/example/project/pull/42",
        },
      ],
      { followees: new Set(), interests: [], repositories: new Map() },
    );

    expect(candidates).toHaveLength(3);
    expect(candidates.map(({ category }) => category).sort()).toEqual([
      "activity",
      "activity",
      "discovery",
    ]);
    expect(candidates.find(({ label }) => label?.includes("#41"))).toMatchObject({
      label: "example/project #41 · Add resumable uploads",
      url: "https://github.com/example/project/pull/41",
      description: "Adds checkpointed upload state so interrupted transfers can resume.",
    });
  });

  it("uses the event identity for publications without an item URL", () => {
    const candidates = buildCandidateProjects(
      [
        {
          id: "feed-item-1",
          type: "article",
          source: "rss",
          actor: "Example Feed",
          repo: "rss:https://example.com/feed.xml",
          createdAt: "2026-08-15T10:00:00Z",
          title: "First",
        },
        {
          id: "feed-item-2",
          type: "article",
          source: "rss",
          actor: "Example Feed",
          repo: "rss:https://example.com/feed.xml",
          createdAt: "2026-08-15T11:00:00Z",
          title: "Second",
        },
      ],
      { followees: new Set(), interests: [], repositories: new Map() },
    );

    expect(candidates.map(candidateIdentity)).toEqual([
      "publication:feed-item-1",
      "publication:feed-item-2",
    ]);
  });

  it("does not treat branch creation as project discovery", () => {
    const card = normalizeEvent({
      id: "branch-1",
      type: "CreateEvent",
      actor: { login: "bartlomieju" },
      repo: { name: "denoland/deno" },
      created_at: "2026-06-22T09:48:29Z",
      payload: {
        ref_type: "branch",
        ref: "feature-branch",
      },
    });

    expect(card.type).toBe("other");
  });

  it("matches interests by tokens instead of accidental substrings", () => {
    const candidates = buildCandidateProjects(
      [
        {
          id: "fork-1",
          type: "fork",
          actor: "bartlomieju",
          repo: "tailwindlabs/headlessui",
          createdAt: "2026-06-22T09:47:11Z",
        },
      ],
      {
        followees: new Set(["bartlomieju"]),
        interests: ["ai"],
        repositories: new Map([
          [
            "tailwindlabs/headlessui",
            {
              fullName: "tailwindlabs/headlessui",
              htmlUrl: "https://github.com/tailwindlabs/headlessui",
              description: "Completely unstyled UI components for Tailwind CSS.",
              language: "TypeScript",
              stargazersCount: 29000,
              topics: [],
              pushedAt: "2026-06-22T02:55:49Z",
            },
          ],
        ]),
      },
    );

    expect(candidates[0]?.reasons).not.toContain("matches interest: ai");
  });

  it("turns matching RSS articles into article candidates", () => {
    const candidates = buildCandidateProjects(
      [
        {
          id: "rss-1",
          type: "article",
          source: "rss",
          actor: "Deno Blog",
          repo: "rss:https://deno.com/blog/v2.4",
          createdAt: "2026-06-22T08:00:00Z",
          action: "published",
          htmlUrl: "https://deno.com/blog/v2.4",
          title: "Deno 2.4",
          summary: "Runtime updates for TypeScript and JavaScript.",
          sourceName: "Deno Blog",
          sourceUrl: "https://deno.com/feed",
          tags: ["deno", "runtime"],
        },
      ],
      {
        followees: new Set(),
        interests: ["deno", "runtime"],
        repositories: new Map(),
      },
    );

    expect(candidates[0]).toMatchObject({
      source: "rss",
      category: "article",
      label: "Deno 2.4",
      url: "https://deno.com/blog/v2.4",
      description: "Runtime updates for TypeScript and JavaScript.",
    });
    expect(candidates[0]?.reasons).toContain("rss feed: Deno Blog");
    expect(candidates[0]?.reasons).toContain("matches interest: deno");
    expect(candidates[0]?.matchedInterests).toContain("deno");
  });

  it("keeps official web page articles distinct from RSS candidates", () => {
    const candidates = buildCandidateProjects(
      [
        {
          id: "web-1",
          type: "article",
          source: "web",
          actor: "Example News",
          repo: "web:https://example.com/news/agent-mode",
          createdAt: "2026-08-12T00:00:00Z",
          htmlUrl: "https://example.com/news/agent-mode",
          title: "Agent Mode",
          sourceName: "Example News",
          sourceUrl: "https://example.com/news",
        },
      ],
      { followees: new Set(), interests: [], repositories: new Map() },
    );

    expect(candidates[0]).toMatchObject({
      source: "web",
      category: "article",
      label: "Agent Mode",
    });
    expect(candidates[0]?.reasons).toContain("website source: Example News");
  });

  it("preserves title, link, and summary for RSS release candidates", () => {
    const candidates = buildCandidateProjects(
      [
        {
          id: "release-1",
          type: "release",
          source: "rss",
          actor: "Vendor Releases",
          repo: "rss:https://example.com/releases/1.0",
          createdAt: "2026-08-09T00:00:00.000Z",
          title: "Version 1.0",
          htmlUrl: "https://example.com/releases/1.0",
          summary: "A major release.",
        },
      ],
      { followees: new Set(), interests: [], repositories: new Map() },
    );

    expect(candidates[0]).toMatchObject({
      category: "release",
      label: "Version 1.0",
      url: "https://example.com/releases/1.0",
      description: "A major release.",
    });
  });

  it("uses feed URL when an RSS article has no item link", () => {
    const candidates = buildCandidateProjects(
      [
        {
          id: "rss-1",
          type: "article",
          source: "rss",
          actor: "Example Feed",
          repo: "rss:guid-1",
          createdAt: "2026-06-22T08:00:00Z",
          title: "Untitled note",
          sourceName: "Example Feed",
          sourceUrl: "https://example.com/feed.xml",
        },
      ],
      {
        followees: new Set(),
        interests: [],
        repositories: new Map(),
      },
    );

    expect(candidates[0]?.url).toBe("https://example.com/feed.xml");
  });

  it("admits papers by abstract relevance and enforces the research quota", () => {
    const paper = (index: number, summary: string) => ({
      id: `paper-${index}`,
      type: "paper" as const,
      source: "rss" as const,
      actor: "arXiv cs.AI",
      repo: `rss:https://arxiv.org/abs/2608.${String(index).padStart(5, "0")}`,
      createdAt: `2026-08-09T0${index}:00:00Z`,
      htmlUrl: `https://arxiv.org/abs/2608.${String(index).padStart(5, "0")}`,
      title: `Agent paper ${index}`,
      summary,
      sourceName: "arXiv cs.AI",
      sourceUrl: "https://rss.arxiv.org/rss/cs.AI",
      tags: ["Papers", "Academic"],
    });
    const candidates = buildCandidateProjects(
      [
        paper(1, "A coding agent learns to use tools in long-running tasks."),
        paper(2, "An agent benchmark evaluates reliable tool use."),
        paper(3, "A chemistry method for molecular simulation."),
      ],
      {
        followees: new Set(),
        interests: ["agent"],
        repositories: new Map(),
      },
    );

    const selected = selectResearchCandidates(candidates, 1);

    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ category: "paper", eventTypes: ["paper"] });
    expect(selected[0]?.reasons).toContain("matches paper abstract: agent");
    expect(selected[0]?.url).toMatch(/^https:\/\/arxiv\.org\/abs\//u);
    expect(selected.some((candidate) => candidate.repo.endsWith("00003"))).toBe(false);
  });

  it("explains GitHub Home trending and recommendation signals", () => {
    const candidates = buildCandidateProjects(
      [
        {
          id: "home-trending-1",
          type: "trending",
          source: "github",
          actor: "GitHub Home",
          repo: "simplex-chat/simplex-chat",
          createdAt: "2026-06-27T11:08:52Z",
          action: "trending",
        },
        {
          id: "home-rec-1",
          type: "recommendation",
          source: "github",
          actor: "GitHub Home",
          repo: "onnx/onnx",
          createdAt: "2026-06-27T00:00:00Z",
          action: "recommended",
        },
      ],
      {
        followees: new Set(),
        interests: [],
        repositories: new Map(),
      },
    );

    expect(
      candidates.find((candidate) => candidate.repo === "simplex-chat/simplex-chat")?.reasons,
    ).toContain("GitHub Home trending repository");
    expect(candidates.find((candidate) => candidate.repo === "onnx/onnx")?.reasons).toContain(
      "GitHub Home recommendation",
    );
  });

  it("records repeated mentions as corroboration without calling them important", () => {
    const candidates = buildCandidateProjects(
      [
        {
          id: "star-1",
          type: "watch",
          actor: "alice",
          repo: "example/project",
          createdAt: "2026-08-09T08:00:00Z",
        },
        {
          id: "star-2",
          type: "watch",
          actor: "bob",
          repo: "example/project",
          createdAt: "2026-08-09T09:00:00Z",
        },
        {
          id: "pr-1",
          type: "pull_request",
          actor: "alice",
          repo: "example/project",
          createdAt: "2026-08-09T10:00:00Z",
          action: "merged",
        },
      ],
      { followees: new Set(["alice", "bob"]), interests: [], repositories: new Map() },
    );

    const repository = candidates.find((candidate) => candidate.category === "discovery");
    const pullRequest = candidates.find((candidate) =>
      candidate.eventTypes.includes("pull_request"),
    );
    expect(repository?.reasons).toContain("multiple followed mentions");
    expect(pullRequest?.reasons).toContain("pull request merged");
    expect(candidates.flatMap(({ reasons }) => reasons).join(" ")).not.toMatch(
      /important|signal/iu,
    );
  });

  it.each([
    { type: "watch" as const, score: 90, reason: "followee starred this repository" },
    { type: "trending" as const, score: 80, reason: "GitHub Home trending repository" },
    { type: "recommendation" as const, score: 75, reason: "GitHub Home recommendation" },
    { type: "announcement" as const, score: 65, reason: "GitHub Home announcement" },
    { type: "release" as const, score: 85, reason: "new release published" },
    { type: "fork" as const, score: 45, reason: "followed actor forked repository" },
    { type: "create" as const, score: 35, reason: "new repository created" },
    { type: "follow" as const, score: 25, reason: "follow relationship from GitHub Home" },
    { type: "article" as const, score: 30, reason: "rss feed: someone" },
    { type: "paper" as const, score: 35, reason: "research paper: someone" },
  ])("base score for $type is $score", ({ type, score, reason }) => {
    const candidate = scoreEvents([{ type }]);
    expect(candidate.score).toBe(score);
    expect(candidate.reasons).toEqual([reason]);
  });

  it.each([
    { action: "merged", score: 55, reason: "pull request merged" },
    { action: "opened", score: 35, reason: undefined },
    { action: "closed", score: 20, reason: undefined },
    { action: "labeled", score: 5, reason: undefined },
  ])("base score for a $action pull request is $score", ({ action, score, reason }) => {
    const candidate = scoreEvents([{ type: "pull_request", action, prNumber: 1 }]);
    expect(candidate.score).toBe(score);
    expect(candidate.reasons).toEqual(reason ? [reason] : []);
  });

  it("adds 30 points for each followed actor", () => {
    const stranger = scoreEvents([{ type: "watch", actor: "dave" }]);
    const followee = scoreEvents([{ type: "watch", actor: "alice" }], {
      followees: new Set(["alice"]),
    });
    expect(followee.score - stranger.score).toBe(30);
    expect(followee.reasons).toContain("followed actor: alice");
    expect(stranger.reasons).not.toContain("followed actor: dave");
  });

  it("adds 20 points plus 5 points per actor when several actors mention one repository", () => {
    const solo = scoreEvents([{ type: "watch", actor: "alice" }]);
    const duo = scoreEvents([
      { type: "watch", actor: "alice" },
      { type: "watch", actor: "bob", id: "2" },
    ]);
    const trio = scoreEvents([
      { type: "watch", actor: "alice" },
      { type: "watch", actor: "bob", id: "2" },
      { type: "watch", actor: "carol", id: "3" },
    ]);
    expect(duo.score - solo.score * 2).toBe(30);
    expect(trio.score - solo.score * 3).toBe(35);
    expect(duo.reasons).toContain("multiple followed mentions");
    expect(solo.reasons).not.toContain("multiple followed mentions");
  });

  it("adds 15 points for a repository interest and 20 points for an event interest", () => {
    const plain = scoreEvents([{ type: "watch" }]);
    const byLanguage = scoreEvents([{ type: "watch" }], {
      interests: ["rustlang"],
      repository: { ...emptyRepository, language: "RustLang" },
    });
    const byTopics = scoreEvents([{ type: "watch" }], {
      interests: ["topicword"],
      repository: { ...emptyRepository, topics: ["topicword"] },
    });
    const byDescription = scoreEvents([{ type: "watch" }], {
      interests: ["descword"],
      repository: { ...emptyRepository, description: "A descword project" },
    });
    const byEvent = scoreEvents(
      [{ type: "article", title: "Compiler notes", summary: "No other overlap." }],
      { interests: ["compiler"] },
    );
    const plainArticle = scoreEvents([
      { type: "article", title: "Weekly notes", summary: "No other overlap." },
    ]);
    expect(byLanguage.score - plain.score).toBe(15);
    expect(byTopics.score - plain.score).toBe(15);
    expect(byDescription.score - plain.score).toBe(15);
    expect(byEvent.score - plainArticle.score).toBe(20);
    expect(byLanguage.reasons).toContain("matches interest: rustlang");
    expect(byTopics.reasons).toContain("matches interest: topicword");
    expect(byDescription.reasons).toContain("matches interest: descword");
    expect(byEvent.reasons).toContain("matches interest: compiler");
  });

  it("matches a paper interest only in the abstract", () => {
    const abstract = scoreEvents(
      [{ type: "paper", title: "Unrelated title", summary: "The abstract covers abstractterm." }],
      { interests: ["abstractterm"] },
    );
    const titleOnly = scoreEvents(
      [{ type: "paper", title: "Notes on abstractterm", summary: "Nothing relevant in the body." }],
      { interests: ["abstractterm"] },
    );
    expect(abstract.score - titleOnly.score).toBe(20);
    expect(abstract.reasons).toContain("matches paper abstract: abstractterm");
    expect(titleOnly.reasons.some((reason) => reason.startsWith("matches paper abstract:"))).toBe(
      false,
    );
    expect(selectResearchCandidates([titleOnly, abstract], 8).map((item) => item.score)).toEqual([
      abstract.score,
    ]);
  });

  it("adds a log10 star bonus capped at 25", () => {
    const at = (stars: number) =>
      scoreEvents([{ type: "watch" }], {
        repository: { ...emptyRepository, stargazersCount: stars },
      }).score;
    expect(at(1_000) - at(1)).toBe(18);
    expect(at(100_000_000) - at(1)).toBe(25);
  });

  it("adds 8 points when the repository was pushed within 14 days", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-16T04:00:00.000Z"));
    try {
      const recent = scoreEvents([{ type: "watch" }], {
        repository: { ...emptyRepository, pushedAt: "2026-08-02T04:00:00.000Z" },
      });
      const stale = scoreEvents([{ type: "watch" }], {
        repository: { ...emptyRepository, pushedAt: "2026-08-02T03:59:59.000Z" },
      });
      expect(recent.score - stale.score).toBe(8);
      expect(recent.reasons).toContain("recently active repository");
      expect(stale.reasons).not.toContain("recently active repository");
    } finally {
      vi.useRealTimers();
    }
  });
});

const emptyRepository = {
  fullName: "example/repo",
  htmlUrl: "https://github.com/example/repo",
  description: null as string | null,
  language: null as string | null,
  stargazersCount: 1,
  topics: [] as string[],
  pushedAt: null as string | null,
};

function scoreEvents(
  events: Array<{
    action?: string;
    actor?: string;
    id?: string;
    prNumber?: number;
    summary?: string;
    title?: string;
    type:
      | "announcement"
      | "article"
      | "create"
      | "follow"
      | "fork"
      | "paper"
      | "pull_request"
      | "recommendation"
      | "release"
      | "trending"
      | "watch";
  }>,
  options: {
    followees?: Set<string>;
    interests?: string[];
    repository?: typeof emptyRepository;
  } = {},
) {
  const [candidate] = buildCandidateProjects(
    events.map((event, index) => ({
      id: event.id ?? String(index + 1),
      type: event.type,
      actor: event.actor ?? "someone",
      repo: "example/repo",
      createdAt: `2026-08-15T02:00:${String(index).padStart(2, "0")}Z`,
      ...(event.action ? { action: event.action } : {}),
      ...(event.prNumber ? { prNumber: event.prNumber } : {}),
      ...(event.title ? { title: event.title } : {}),
      ...(event.summary ? { summary: event.summary } : {}),
      source: event.type === "article" || event.type === "paper" ? ("rss" as const) : undefined,
      sourceName:
        event.type === "article" || event.type === "paper" ? (event.actor ?? "someone") : undefined,
    })),
    {
      followees: options.followees ?? new Set<string>(),
      interests: options.interests ?? [],
      repositories: new Map(options.repository ? [["example/repo", options.repository]] : []),
    },
  );
  if (!candidate) throw new Error("expected a scored candidate");
  return candidate;
}

describe("research keys", () => {
  it("uses canonical URLs as research keys for RSS article candidates", () => {
    expect(
      researchKeyForCandidate({
        ...candidate("rss:item-1", ["rss-1"], {
          source: "rss",
          category: "article",
          eventTypes: ["article"],
          eventType: "article",
        }),
        url: "https://example.com/post",
      }),
    ).toBe("rss:https://example.com/post");
  });

  it("keeps web page research identity separate from RSS identity", () => {
    expect(
      researchKeyForCandidate({
        ...candidate("web:item-1", ["web-1"], {
          source: "web",
          category: "article",
          eventTypes: ["article"],
          eventType: "article",
        }),
        url: "https://example.com/news/post",
      }),
    ).toBe("web:https://example.com/news/post");
  });

  it("uses repository identity to dedupe star research across new star events", () => {
    const state = createEmptyFeedState();
    const firstStar = candidate("owner/useful-tool", ["star-1"], {
      category: "discovery",
      eventTypes: ["watch"],
      eventType: "watch",
    });
    const secondStar = candidate("owner/useful-tool", ["star-2"], {
      category: "discovery",
      eventTypes: ["watch"],
      eventType: "watch",
      actor: "another-followee",
    });

    markCandidateResearched(state, firstStar, {
      at: "2026-06-28T08:00:00Z",
      decision: "track",
      reason: "useful agent tooling project",
    });

    expect(filterUndelivered([secondStar], eventIdsOf, state)).toEqual([secondStar]);
    expect(filterUnresearched([secondStar], researchKeyForCandidate, state)).toEqual([]);
    expect(state.researched).toHaveProperty("github:owner/useful-tool");
  });
});

function eventIdsOf(candidate: CandidateProject): string[] {
  return candidate.events.map((event) => event.id);
}

function candidate(
  repo: string,
  eventIds: string[],
  options: {
    actor?: string;
    source?: CandidateProject["source"];
    category?: CandidateProject["category"];
    eventTypes?: CandidateProject["eventTypes"];
    eventType?: CandidateProject["events"][number]["type"];
  } = {},
): CandidateProject {
  const actor = options.actor ?? "actor";
  const eventType = options.eventType ?? "pull_request";
  return {
    repo,
    source: options.source ?? "github",
    category: options.category ?? "activity",
    score: 10,
    actors: [actor],
    eventTypes: options.eventTypes ?? ["pull_request"],
    reasons: ["test"],
    events: eventIds.map((id) => ({
      id,
      type: eventType,
      actor,
      repo,
      createdAt: "2026-06-24T08:00:00Z",
    })),
  };
}

describe("candidate presentation depth", () => {
  it("keeps ordinary trusted-source updates compact", () => {
    expect(
      presentationDepthForCandidate(
        presented({ category: "release", eventTypes: ["release"], score: 30 }),
      ),
    ).toBe("link");
  });

  it("expands RSS publications and pull requests only for the subscription policy", () => {
    expect(presentationDepthForCandidate(presented({ score: 30 }))).toBe("link");
    expect(
      presentationDepthForCandidate(presented({ score: 30 }), { semanticSummaries: true }),
    ).toBe("summary");
    expect(
      presentationDepthForCandidate(
        presented({
          repo: "example/project",
          source: "github",
          category: "activity",
          eventTypes: ["pull_request"],
          score: 20,
        }),
        { semanticSummaries: true },
      ),
    ).toBe("summary");
  });

  it("expands explainable importance matches and routes papers to research", () => {
    expect(
      presentationDepthForCandidate(presented({ score: 50, matchedInterests: ["agent"] })),
    ).toBe("summary");
    expect(
      presentationDepthForCandidate(
        presented({ category: "release", score: 20, matchedInterests: ["agent"] }),
      ),
    ).toBe("summary");
    expect(presentationDepthForCandidate(presented({ category: "paper", score: 80 }))).toBe(
      "research",
    );
  });

  it("does not expand an item from score alone", () => {
    expect(
      presentationDepthForCandidate(
        presented({ category: "release", eventTypes: ["release"], score: 100 }),
      ),
    ).toBe("link");
    expect(presentationDepthForCandidate(presented({ category: "release", score: 85 }))).toBe(
      "link",
    );
  });

  it("uses repeated mentions only for ranking, not for summary expansion", () => {
    expect(
      presentationDepthForCandidate(
        presented({
          category: "release",
          eventTypes: ["release"],
          score: 120,
          reasons: ["multiple followed mentions"],
        }),
      ),
    ).toBe("link");
    expect(
      presentationDepthForCandidate(
        presented({
          category: "release",
          eventTypes: ["release"],
          score: 65,
          reasons: ["GitHub Home announcement"],
        }),
      ),
    ).toBe("link");
    expect(
      presentationDepthForCandidate(
        presented({
          category: "release",
          eventTypes: ["release"],
          score: 55,
          reasons: ["pull request merged"],
        }),
      ),
    ).toBe("link");
  });

  it("expands explicit high-impact changes even without an interest match", () => {
    const security = presentationDecisionForCandidate(
      presented({
        category: "release",
        score: 40,
        label: "Runtime security update",
        description: "Fixes CVE-2026-12345 and a critical vulnerability.",
      }),
    );
    expect(security).toMatchObject({
      depth: "summary",
      reasonCode: "security-event",
      evidence: "security update",
    });
    expect(
      presentationDepthForCandidate(
        presented({ score: 40, label: "API 弃用公告", description: "包含破坏性变更。" }),
      ),
    ).toBe("summary");
  });

  it.each([
    ["安全漏洞", "security-event"],
    ["高危漏洞", "security-event"],
    ["供应链攻击", "security-event"],
    ["数据泄露", "security-event"],
    ["critical vulnerability", "security-event"],
    ["security advisory", "security-event"],
    ["security update", "security-event"],
    ["supply-chain attack", "security-event"],
    ["data breach", "security-event"],
    ["CVE-2026-12345", "security-event"],
    ["重大故障", "service-incident"],
    ["大规模中断", "service-incident"],
    ["major outage", "service-incident"],
    ["重大变更", "breaking-change"],
    ["破坏性变更", "breaking-change"],
    ["不兼容", "breaking-change"],
    ["breaking change", "breaking-change"],
    ["breaking changes", "breaking-change"],
    ["弃用", "deprecation"],
    ["停止支持", "deprecation"],
    ["deprecated", "deprecation"],
    ["deprecation", "deprecation"],
    ["end of support", "deprecation"],
    ["重大版本", "major-release"],
    ["正式发布", "major-release"],
    ["正式上线", "major-release"],
    ["开放公测", "major-release"],
    ["公开预览", "major-release"],
    ["全面可用", "major-release"],
    ["general availability", "major-release"],
    ["generally available", "major-release"],
    ["public preview", "major-release"],
    ["major release", "major-release"],
  ] as const)("classifies %s as %s", (keyword, reasonCode) => {
    expect(
      presentationDecisionForCandidate(
        presented({
          category: "release",
          eventTypes: ["release"],
          score: 10,
          label: keyword,
          description: "ordinary wording",
        }),
      ),
    ).toEqual({ depth: "summary", reasonCode, evidence: keyword });
  });

  it("marks articles and pull requests as semantic summaries only when that policy is on", () => {
    const article = presented({
      score: 10,
      label: "Ordinary note",
      description: "No impact phrase.",
    });
    const pullRequest = presented({
      score: 10,
      source: "github",
      category: "activity",
      eventTypes: ["pull_request"],
      repo: "example/project",
      label: "Ordinary change",
      description: "No impact phrase.",
    });
    const release = presented({
      score: 10,
      category: "release",
      eventTypes: ["release"],
      label: "Ordinary release",
      description: "No impact phrase.",
    });
    expect(presentationDecisionForCandidate(article, { semanticSummaries: true })).toEqual({
      depth: "summary",
      reasonCode: "semantic-summary",
    });
    expect(presentationDecisionForCandidate(article)).toEqual({
      depth: "link",
      reasonCode: "ordinary-update",
    });
    expect(presentationDecisionForCandidate(pullRequest, { semanticSummaries: true })).toEqual({
      depth: "summary",
      reasonCode: "semantic-summary",
    });
    expect(presentationDecisionForCandidate(release, { semanticSummaries: true })).toEqual({
      depth: "link",
      reasonCode: "ordinary-update",
    });
  });

  it("returns typed interest evidence instead of parsing display reasons", () => {
    expect(
      presentationDecisionForCandidate(
        presented({
          score: 50,
          reasons: ["arbitrary display copy"],
          matchedInterests: ["agent"],
        }),
      ),
    ).toEqual({ depth: "summary", reasonCode: "interest-match", evidence: "agent" });
  });
});

function presented(
  overrides: Partial<CandidateProject> & Pick<CandidateProject, "score">,
): CandidateProject {
  return {
    repo: "rss:https://example.com/post",
    source: "rss",
    category: "article",
    actors: ["Example"],
    eventTypes: ["article"],
    reasons: [],
    events: [],
    ...overrides,
  };
}

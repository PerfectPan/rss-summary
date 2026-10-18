import { describe, expect, it } from "vite-plus/test";

import { candidateEvidenceUrl, candidateIdentity, researchKeyForCandidate } from "./identity.js";
import type { ActivityCardDto } from "../../acquisition/index.js";
import type { CandidateProject } from "../../editorial/index.js";
import {
  createEmptyFeedState,
  filterUndelivered,
  filterUnresearched,
} from "../../delivery/index.js";

function card(overrides: Partial<ActivityCardDto>): ActivityCardDto {
  return {
    id: "123",
    type: "other",
    source: "github",
    actor: "someone",
    repo: "owner/repo",
    createdAt: "2026-08-16T00:00:00Z",
    ...overrides,
  } as ActivityCardDto;
}

describe("candidate identity keys", () => {
  it("keeps the historical prefixes per event kind", () => {
    expect(
      candidateIdentity({
        events: [card({ type: "pull_request", repo: "owner/repo", prNumber: 7 })],
        source: "github",
        category: "activity",
        repo: "owner/repo",
      }),
    ).toBe("github-pull-request:owner/repo:7");

    expect(
      candidateIdentity({
        events: [card({ source: "rss", htmlUrl: "https://example.com/a" })],
        source: "rss",
        category: "article",
        repo: "rss:https://example.com/a",
      }),
    ).toBe("publication:https://example.com/a");

    expect(
      candidateIdentity({
        events: [card({ type: "release", htmlUrl: "https://example.com/release" })],
        source: "github",
        category: "release",
        repo: "owner/repo",
      }),
    ).toBe("github-release:https://example.com/release");

    expect(
      candidateIdentity({
        events: [card({ type: "fork" })],
        source: "github",
        category: "discovery",
        repo: "owner/repo",
      }),
    ).toBe("github-repository:owner/repo");
  });

  it("falls back to candidate fields when the event list is empty", () => {
    expect(
      candidateIdentity({ events: [], source: "rss", category: "article", repo: "rss:x" }),
    ).toBe("publication:rss:x");
    expect(
      candidateIdentity({ events: [], source: "github", category: "release", repo: "owner/repo" }),
    ).toBe("github-release:owner/repo");
    expect(
      candidateIdentity({ events: [], source: "github", category: "activity", repo: "owner/repo" }),
    ).toBe("github-repository:owner/repo");
  });

  it("maps publication candidates onto the research ledger keys", () => {
    expect(
      researchKeyForCandidate({
        events: [],
        source: "rss",
        category: "article",
        repo: "rss:https://example.com/a",
        url: "https://example.com/a",
      }),
    ).toBe("rss:https://example.com/a");
    expect(
      researchKeyForCandidate({
        events: [],
        source: "web",
        category: "paper",
        repo: "web:https://example.com/p",
        url: "https://example.com/p",
      }),
    ).toBe("web:https://example.com/p");
    expect(
      researchKeyForCandidate({
        events: [],
        source: "github",
        category: "activity",
        repo: "owner/repo",
      }),
    ).toBe("github:owner/repo");
  });

  it("derives the evidence fallback URL from the repository", () => {
    expect(candidateEvidenceUrl({ repo: "owner/repo" })).toBe("https://github.com/owner/repo");
  });
});

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

// The product entry (app/products/subscriptions/output.ts) records research
// under the ledger key; the tests rebuild that one-liner to stay inside the
// acquisition boundary.
function markCandidateResearched(
  state: { researched: Record<string, { at: string; decision?: string; reason?: string }> },
  candidate: CandidateProject,
  record: { at: string; decision?: string; reason?: string },
): void {
  state.researched[researchKeyForCandidate(candidate)] = record;
}

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

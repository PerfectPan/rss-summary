import { describe, expect, it } from "vitest";

import type { CandidateProject } from "../src/domain.js";
import {
  createEmptyFeedState,
  filterNewCandidates,
  filterUnresearchedCandidates,
  markCandidateResearched,
  markCandidatesSeen,
  researchKeyForCandidate,
} from "../src/state.js";

describe("feed state", () => {
  it("keeps candidates with unseen events and filters fully seen candidates", () => {
    const state = createEmptyFeedState();
    state.seen["event-seen"] = "2026-06-23T09:00:00Z";

    const candidates = [
      candidate("seen/repo", ["event-seen"]),
      candidate("new/repo", ["event-seen", "event-new"]),
    ];

    expect(filterNewCandidates(candidates, state).map((item) => item.repo)).toEqual(["new/repo"]);
  });

  it("marks candidate events as seen", () => {
    const state = createEmptyFeedState();

    markCandidatesSeen(state, [candidate("new/repo", ["event-1", "event-2"])], "2026-06-24T08:00:00Z");

    expect(state.seen).toEqual({
      "event-1": "2026-06-24T08:00:00Z",
      "event-2": "2026-06-24T08:00:00Z",
    });
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

    expect(filterNewCandidates([secondStar], state)).toEqual([secondStar]);
    expect(filterUnresearchedCandidates([secondStar], state)).toEqual([]);
    expect(state.researched).toHaveProperty("github:owner/useful-tool");
  });

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
});

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

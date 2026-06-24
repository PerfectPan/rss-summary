import { describe, expect, it } from "vitest";

import type { CandidateProject } from "../src/domain.js";
import { createEmptyFeedState, filterNewCandidates, markCandidatesSeen } from "../src/state.js";

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
});

function candidate(repo: string, eventIds: string[]): CandidateProject {
  return {
    repo,
    source: "github",
    category: "activity",
    score: 10,
    actors: ["actor"],
    eventTypes: ["pull_request"],
    reasons: ["test"],
    events: eventIds.map((id) => ({
      id,
      type: "pull_request",
      actor: "actor",
      repo,
      createdAt: "2026-06-24T08:00:00Z",
    })),
  };
}

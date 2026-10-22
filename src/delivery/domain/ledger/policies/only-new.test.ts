import { describe, expect, it } from "vite-plus/test";

import {
  createEmptyFeedState,
  filterUndelivered,
  filterUnresearched,
  markResearched,
} from "../index.js";

describe("delivery ledger", () => {
  it("keeps candidates with unseen events and filters fully seen candidates", () => {
    const state = createEmptyFeedState();
    state.seen["event-seen"] = "2026-06-23T09:00:00Z";

    const candidates = [
      candidate("seen/repo", ["event-seen"]),
      candidate("new/repo", ["event-seen", "event-new"]),
    ];

    expect(filterUndelivered(candidates, eventIdsOf, state).map((item) => item.repo)).toEqual([
      "new/repo",
    ]);
  });

  it("filters candidates whose research key already has a record", () => {
    const state = createEmptyFeedState();
    const next = markResearched(state, "github:owner/repo", {
      at: "2026-07-01T00:00:00Z",
      decision: "track",
    });

    expect(next.researched["github:owner/repo"]).toEqual({
      at: "2026-07-01T00:00:00Z",
      decision: "track",
    });
    expect(
      filterUnresearched([candidate("owner/repo", ["e1"])], () => "github:owner/repo", next),
    ).toEqual([]);
    expect(
      filterUnresearched([candidate("owner/other", ["e2"])], () => "github:owner/other", next),
    ).toHaveLength(1);
  });

  it("does not treat an empty event id as a delivery identity", () => {
    const state = createEmptyFeedState();

    expect(filterUndelivered([candidate("repo", [""])], eventIdsOf, state)).toEqual([]);
  });
});

type TestCandidate = { repo: string; events: Array<{ id: string }> };

function candidate(repo: string, eventIds: string[]): TestCandidate {
  return { repo, events: eventIds.map((id) => ({ id })) };
}

function eventIdsOf(candidate: TestCandidate): string[] {
  return candidate.events.map((event) => event.id);
}

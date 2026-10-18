import { describe, expect, it } from "vite-plus/test";

import { createEmptyFeedState, markDelivered } from "../index.js";

describe("delivery ledger", () => {
  it("marks candidate events as seen in the returned state", () => {
    const next = markDelivered(
      createEmptyFeedState(),
      eventIdsOf(candidate("new/repo", ["event-1", "event-2"])),
      "2026-06-24T08:00:00Z",
    );

    expect(next.seen).toEqual({
      "event-1": "2026-06-24T08:00:00Z",
      "event-2": "2026-06-24T08:00:00Z",
    });
  });

  it("keeps the historical key order when marking already-delivered events", () => {
    const state = { seen: { "event-a": "2026-06-23T09:00:00Z" }, researched: {} };

    const next = markDelivered(state, ["event-b", "event-a", "event-c"], "2026-06-24T08:00:00Z");

    expect(JSON.stringify(next)).toBe(
      JSON.stringify({
        seen: {
          "event-a": "2026-06-24T08:00:00Z",
          "event-b": "2026-06-24T08:00:00Z",
          "event-c": "2026-06-24T08:00:00Z",
        },
        researched: {},
      }),
    );
  });

  it("does not treat an empty event id as a delivery identity", () => {
    const state = createEmptyFeedState();

    expect(markDelivered(state, [""], "2026-06-24T08:00:00Z").seen).toEqual({});
  });
});

type TestCandidate = { repo: string; events: Array<{ id: string }> };

function candidate(repo: string, eventIds: string[]): TestCandidate {
  return { repo, events: eventIds.map((id) => ({ id })) };
}

function eventIdsOf(candidate: TestCandidate): string[] {
  return candidate.events.map((event) => event.id);
}

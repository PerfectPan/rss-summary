import { describe, expect, it } from "vite-plus/test";

import {
  buildSubscriptionEvidence,
  candidateIdentity,
  markCandidateResearched,
  subscriptionEvidenceId,
  type DigestDocument,
} from "../../../../src/app/products/subscriptions/output.js";

function document(): DigestDocument {
  return {
    generatedAt: "2026-08-16T04:00:00.000Z",
    username: "PerfectPan",
    candidates: [
      {
        repo: "owner/repo",
        source: "github",
        category: "activity",
        score: 60,
        actors: ["someone"],
        eventTypes: ["fork"],
        reasons: [],
        matchedInterests: [],
        events: [
          {
            id: "123",
            type: "fork",
            source: "github",
            actor: "someone",
            repo: "owner/repo",
            createdAt: "2026-08-16T00:00:00Z",
          },
        ],
      },
    ],
  };
}

describe("subscriptions output projection", () => {
  it("builds evidence ids from the adapter identity", () => {
    const evidence = buildSubscriptionEvidence(document());
    expect(evidence.map(({ id }) => id)).toEqual(["github-repository:owner/repo"]);
  });

  it("exposes the identity and research ledger key helpers", () => {
    const candidate = document().candidates[0]!;
    expect(subscriptionEvidenceId(candidate)).toBe("github-repository:owner/repo");
    const state = { researched: {} };
    markCandidateResearched(state, candidate, { at: "2026-08-16T04:00:00Z", decision: "track" });
    expect(state.researched).toEqual({
      "github:owner/repo": { at: "2026-08-16T04:00:00Z", decision: "track" },
    });
    expect(candidateIdentity(candidate)).toBe("github-repository:owner/repo");
  });

  it("keeps sourceMode in the external document shape", () => {
    expect(document().sourceMode).toBeUndefined();
    expect({ ...document(), sourceMode: "rss" }.sourceMode).toBe("rss");
  });
});

import { describe, expect, it } from "vite-plus/test";

import { candidateDecision } from "../../src/domain/run-audit.js";
import type { CandidateProject } from "../../src/domain/digest.js";

describe("run audit candidate decisions", () => {
  it("records selected output depth and explicit filter reasons", () => {
    const selected = candidate("selected", 70, ["agent"]);
    const filtered = candidate("filtered", 20);

    expect(candidateDecision(selected, [selected], () => "unused")).toMatchObject({
      status: "selected",
      depth: "summary",
      presentationReasonCode: "interest-match",
      presentationEvidence: "agent",
      reason: "selected for expanded summary: interest-match (agent)",
    });
    expect(
      candidateDecision(filtered, [selected], () => "already delivered", {
        semanticSummaries: true,
      }),
    ).toMatchObject({
      status: "filtered",
      depth: "summary",
      presentationReasonCode: "semantic-summary",
      reason: "already delivered",
    });
  });
});

function candidate(repo: string, score: number, matchedInterests: string[] = []): CandidateProject {
  return {
    repo,
    source: "rss",
    category: "article",
    score,
    actors: ["Example"],
    eventTypes: ["article"],
    reasons: [],
    matchedInterests,
    events: [],
  };
}

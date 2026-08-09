import { describe, expect, it } from "vite-plus/test";

import { presentationDepthForCandidate } from "../../src/domain/attention.js";
import type { CandidateProject } from "../../src/domain/digest.js";

describe("candidate presentation depth", () => {
  it("keeps ordinary trusted-source updates compact", () => {
    expect(presentationDepthForCandidate(candidate({ score: 30 }))).toBe("link");
  });

  it("expands explainable strong signals and routes papers to research", () => {
    expect(
      presentationDepthForCandidate(candidate({ score: 50, reasons: ["matches interest: agent"] })),
    ).toBe("summary");
    expect(
      presentationDepthForCandidate(
        candidate({ category: "release", score: 20, reasons: ["matches interest: agent"] }),
      ),
    ).toBe("summary");
    expect(presentationDepthForCandidate(candidate({ category: "paper", score: 80 }))).toBe(
      "research",
    );
  });

  it("does not expand an item from score alone", () => {
    expect(presentationDepthForCandidate(candidate({ score: 100 }))).toBe("link");
    expect(presentationDepthForCandidate(candidate({ category: "release", score: 85 }))).toBe(
      "link",
    );
  });
});

function candidate(
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

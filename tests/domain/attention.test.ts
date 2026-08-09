import { describe, expect, it } from "vite-plus/test";

import { presentationDepthForCandidate } from "../../src/domain/attention.js";
import type { CandidateProject } from "../../src/domain/digest.js";

describe("candidate presentation depth", () => {
  it("keeps ordinary trusted-source updates compact", () => {
    expect(presentationDepthForCandidate(candidate({ score: 30 }))).toBe("link");
  });

  it("expands explainable importance matches and routes papers to research", () => {
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

  it("uses repeated mentions only for ranking, not for summary expansion", () => {
    expect(
      presentationDepthForCandidate(
        candidate({ score: 120, reasons: ["multiple followed mentions"] }),
      ),
    ).toBe("link");
    expect(
      presentationDepthForCandidate(
        candidate({ score: 65, reasons: ["GitHub Home announcement"] }),
      ),
    ).toBe("link");
    expect(
      presentationDepthForCandidate(candidate({ score: 55, reasons: ["pull request merged"] })),
    ).toBe("link");
  });

  it("expands explicit high-impact changes even without an interest match", () => {
    expect(
      presentationDepthForCandidate(
        candidate({
          category: "release",
          score: 40,
          label: "Runtime security update",
          description: "Fixes CVE-2026-12345 and a critical vulnerability.",
        }),
      ),
    ).toBe("summary");
    expect(
      presentationDepthForCandidate(
        candidate({ score: 40, label: "API 弃用公告", description: "包含破坏性变更。" }),
      ),
    ).toBe("summary");
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

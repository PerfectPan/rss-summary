import { describe, expect, it } from "vite-plus/test";

import {
  presentationDecisionForCandidate,
  presentationDepthForCandidate,
} from "../../src/domain/attention.js";
import type { CandidateProject } from "../../src/domain/digest.js";

describe("candidate presentation depth", () => {
  it("keeps ordinary trusted-source updates compact", () => {
    expect(
      presentationDepthForCandidate(
        candidate({ category: "release", eventTypes: ["release"], score: 30 }),
      ),
    ).toBe("link");
  });

  it("expands RSS publications and pull requests only for the subscription policy", () => {
    expect(presentationDepthForCandidate(candidate({ score: 30 }))).toBe("link");
    expect(
      presentationDepthForCandidate(candidate({ score: 30 }), { semanticSummaries: true }),
    ).toBe("summary");
    expect(
      presentationDepthForCandidate(
        candidate({
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
      presentationDepthForCandidate(candidate({ score: 50, matchedInterests: ["agent"] })),
    ).toBe("summary");
    expect(
      presentationDepthForCandidate(
        candidate({ category: "release", score: 20, matchedInterests: ["agent"] }),
      ),
    ).toBe("summary");
    expect(presentationDepthForCandidate(candidate({ category: "paper", score: 80 }))).toBe(
      "research",
    );
  });

  it("does not expand an item from score alone", () => {
    expect(
      presentationDepthForCandidate(
        candidate({ category: "release", eventTypes: ["release"], score: 100 }),
      ),
    ).toBe("link");
    expect(presentationDepthForCandidate(candidate({ category: "release", score: 85 }))).toBe(
      "link",
    );
  });

  it("uses repeated mentions only for ranking, not for summary expansion", () => {
    expect(
      presentationDepthForCandidate(
        candidate({
          category: "release",
          eventTypes: ["release"],
          score: 120,
          reasons: ["multiple followed mentions"],
        }),
      ),
    ).toBe("link");
    expect(
      presentationDepthForCandidate(
        candidate({
          category: "release",
          eventTypes: ["release"],
          score: 65,
          reasons: ["GitHub Home announcement"],
        }),
      ),
    ).toBe("link");
    expect(
      presentationDepthForCandidate(
        candidate({
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
      candidate({
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
        candidate({ score: 40, label: "API 弃用公告", description: "包含破坏性变更。" }),
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
        candidate({
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
    const article = candidate({
      score: 10,
      label: "Ordinary note",
      description: "No impact phrase.",
    });
    const pullRequest = candidate({
      score: 10,
      source: "github",
      category: "activity",
      eventTypes: ["pull_request"],
      repo: "example/project",
      label: "Ordinary change",
      description: "No impact phrase.",
    });
    const release = candidate({
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
        candidate({
          score: 50,
          reasons: ["arbitrary display copy"],
          matchedInterests: ["agent"],
        }),
      ),
    ).toEqual({ depth: "summary", reasonCode: "interest-match", evidence: "agent" });
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

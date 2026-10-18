import { describe, expect, it } from "vite-plus/test";

import {
  candidateEvidenceUrl,
  candidateIdentity,
  researchKeyForCandidate,
} from "../../../../../src/acquisition/domain/item/adapters/identity.js";
import type { ActivityCardDto } from "../../../../../src/acquisition/index.js";

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

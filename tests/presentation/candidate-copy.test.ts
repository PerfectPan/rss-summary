import { describe, expect, it } from "vite-plus/test";

import { candidateCopy } from "../../src/presentation/candidate-copy.js";

describe("candidate copy", () => {
  it("builds a compact sentence and bounded summary from a feed item", () => {
    const copy = candidateCopy({
      repo: "rss:https://example.com/post",
      source: "rss",
      category: "article",
      score: 30,
      actors: ["Example Blog"],
      eventTypes: ["article"],
      reasons: [],
      events: [],
      label: "A useful post",
      url: "https://example.com/post",
      description: "A concrete explanation.",
    });

    expect(copy.oneLine).toBe("发布了「A useful post」。");
    expect(copy.summary).toBe("A concrete explanation.");
  });

  it("uses the human source name for an RSS release", () => {
    const copy = candidateCopy({
      repo: "rss:https://github.com/example/tool/releases/1.0",
      source: "rss",
      category: "release",
      score: 85,
      actors: ["Example Releases"],
      eventTypes: ["release"],
      reasons: ["new release published"],
      events: [],
      label: "Version 1.0",
      url: "https://github.com/example/tool/releases/1.0",
    });

    expect(copy.oneLine).toBe("发布了「Version 1.0」。");
  });

  it("preserves repository facts and pull-request semantics", () => {
    const repository = candidateCopy({
      repo: "example/project",
      source: "github",
      category: "discovery",
      score: 90,
      actors: ["alice"],
      eventTypes: ["watch"],
      reasons: [],
      events: [],
      repository: {
        fullName: "example/project",
        htmlUrl: "https://github.com/example/project",
        description: "A useful project.",
        language: "TypeScript",
        stargazersCount: 12_345,
        topics: [],
        pushedAt: "2026-08-15T00:00:00Z",
      },
    });
    const pullRequest = candidateCopy(
      {
        repo: "example/project",
        source: "github",
        category: "activity",
        score: 35,
        actors: ["bob"],
        eventTypes: ["pull_request"],
        reasons: [],
        events: [
          {
            id: "pr-41",
            type: "pull_request",
            actor: "bob",
            repo: "example/project",
            createdAt: "2026-08-15T00:00:00Z",
            prNumber: 41,
            title: "Add resumable uploads",
          },
        ],
        label: "example/project #41 · Add resumable uploads",
        url: "https://github.com/example/project/pull/41",
      },
      { editorialSummary: "为上传流程增加断点续传，避免网络中断后从头开始。" },
    );

    expect(repository.facts).toEqual(["⭐ 12.3k", "TypeScript"]);
    expect(repository.oneLine).toContain("⭐ 12.3k");
    expect(pullRequest.oneLine).toBe("PR #41 · Add resumable uploads");
    expect(pullRequest.summary).toBe("为上传流程增加断点续传，避免网络中断后从头开始。");
  });
});

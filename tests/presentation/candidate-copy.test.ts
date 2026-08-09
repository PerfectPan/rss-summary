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

    expect(copy.oneLine).toBe("Example Blog 发布了「A useful post」。");
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

    expect(copy.oneLine).toBe("Example Releases 发布了「Version 1.0」。");
  });
});

import { describe, expect, it } from "vite-plus/test";

import {
  acquireActivityCard,
  activityGroupKey,
  applyScoringContext,
  refreshRouting,
} from "../../../../../src/acquisition/domain/item/adapters/scoring-trace.js";
import type { ActivityCardDto } from "../../../../../src/acquisition/index.js";

const card = (overrides: Partial<ActivityCardDto> = {}): ActivityCardDto => ({
  id: "1",
  type: "watch",
  actor: "ada",
  repo: "example/repo",
  createdAt: "2026-08-15T02:00:00.000Z",
  ...overrides,
});

describe("scoring trace", () => {
  it("stamps the historical group key and channel data", () => {
    expect(activityGroupKey(card({ type: "pull_request", prNumber: 7 }))).toBe(
      "github-pull-request:example/repo:7",
    );
    expect(activityGroupKey(card({ type: "release", htmlUrl: "https://example.com/rel" }))).toBe(
      "github-release:https://example.com/rel",
    );
    expect(
      activityGroupKey(card({ type: "article", source: "rss", htmlUrl: "https://example.com/a" })),
    ).toBe("publication:https://example.com/a");
    const paper = acquireActivityCard(card({ type: "paper", title: "Notes" }));
    expect(paper.item.routing).toMatchObject({
      channel: "github",
      channelRank: 1,
      contentResearch: true,
      feedPrefix: "rss",
      sitePrefix: "web",
      catalogResearchKey: "github:example/repo",
    });
  });

  it("keeps an empty repository name and restores the record after a card edit", () => {
    const repository = {
      fullName: "",
      htmlUrl: "https://github.com/example/repo",
      description: null,
      language: null,
      stargazersCount: 0,
      topics: [],
      pushedAt: "2026-08-02T04:00:00.000Z",
    };
    const acquired = applyScoringContext(acquireActivityCard(card()), {
      followees: new Set([""]),
      repositories: new Map([["example/repo", repository]]),
    });
    expect(acquired.item.subject.name).toBe("");
    acquired.card.title = "Updated";
    const refreshed = refreshRouting(acquired);
    expect(refreshed.item.subject.name).toBe("");
    expect(refreshed.item.routing?.record).toBe(repository);
    expect(refreshed.item.subject.profile?.popularity).toBe(0);
  });
});

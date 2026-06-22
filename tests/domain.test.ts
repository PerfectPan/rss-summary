import { describe, expect, it } from "vitest";

import { buildCandidateProjects, normalizeEvent } from "../src/domain.js";

describe("github feed domain", () => {
  it("normalizes a merged pull request event into an activity card", () => {
    const card = normalizeEvent({
      id: "10883496662",
      type: "PullRequestEvent",
      actor: { login: "bartlomieju" },
      repo: { name: "denoland/deno" },
      created_at: "2026-06-22T09:48:29Z",
      payload: {
        action: "merged",
        number: 35406,
        pull_request: {
          url: "https://api.github.com/repos/denoland/deno/pulls/35406",
        },
      },
    });

    expect(card).toEqual({
      id: "10883496662",
      type: "pull_request",
      actor: "bartlomieju",
      repo: "denoland/deno",
      createdAt: "2026-06-22T09:48:29Z",
      action: "merged",
      prNumber: 35406,
      detailUrl: "https://api.github.com/repos/denoland/deno/pulls/35406",
    });
  });

  it("prioritizes project discovery from a followee star over routine PR activity", () => {
    const candidates = buildCandidateProjects(
      [
        {
          id: "star-1",
          type: "watch",
          actor: "fi3ework",
          repo: "BuilderIO/skills",
          createdAt: "2026-06-22T09:47:11Z",
          action: "started",
        },
        {
          id: "pr-1",
          type: "pull_request",
          actor: "someone",
          repo: "example/noisy",
          createdAt: "2026-06-22T09:40:00Z",
          action: "labeled",
          prNumber: 1,
        },
      ],
      {
        followees: new Set(["fi3ework"]),
        interests: ["agent", "skills"],
        repositories: new Map([
          [
            "BuilderIO/skills",
            {
              fullName: "BuilderIO/skills",
              htmlUrl: "https://github.com/BuilderIO/skills",
              description: "Skills for coding agents",
              language: "JavaScript",
              stargazersCount: 2389,
              topics: ["skills"],
              pushedAt: "2026-06-22T02:55:49Z",
            },
          ],
        ]),
      },
    );

    expect(candidates[0]?.repo).toBe("BuilderIO/skills");
    expect(candidates[0]?.category).toBe("discovery");
    expect(candidates[0]?.score).toBeGreaterThan(candidates[1]?.score ?? 0);
    expect(candidates[0]?.reasons).toContain("followee starred this repository");
  });

  it("does not treat branch creation as project discovery", () => {
    const card = normalizeEvent({
      id: "branch-1",
      type: "CreateEvent",
      actor: { login: "bartlomieju" },
      repo: { name: "denoland/deno" },
      created_at: "2026-06-22T09:48:29Z",
      payload: {
        ref_type: "branch",
        ref: "feature-branch",
      },
    });

    expect(card.type).toBe("other");
  });

  it("matches interests by tokens instead of accidental substrings", () => {
    const candidates = buildCandidateProjects(
      [
        {
          id: "fork-1",
          type: "fork",
          actor: "bartlomieju",
          repo: "tailwindlabs/headlessui",
          createdAt: "2026-06-22T09:47:11Z",
        },
      ],
      {
        followees: new Set(["bartlomieju"]),
        interests: ["ai"],
        repositories: new Map([
          [
            "tailwindlabs/headlessui",
            {
              fullName: "tailwindlabs/headlessui",
              htmlUrl: "https://github.com/tailwindlabs/headlessui",
              description: "Completely unstyled UI components for Tailwind CSS.",
              language: "TypeScript",
              stargazersCount: 29000,
              topics: [],
              pushedAt: "2026-06-22T02:55:49Z",
            },
          ],
        ]),
      },
    );

    expect(candidates[0]?.reasons).not.toContain("matches interest: ai");
  });
});

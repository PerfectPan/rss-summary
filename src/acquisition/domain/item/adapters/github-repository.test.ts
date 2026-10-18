import { describe, expect, it } from "vite-plus/test";

import { acquireFollowing, acquirePullRequest, acquireRepository } from "./github-repository.js";

describe("github repository adapter", () => {
  it("maps a repository document onto metadata and a project profile", () => {
    const acquired = acquireRepository({
      full_name: "acme/agent-kit",
      html_url: "https://github.com/acme/agent-kit",
      description: "An agent harness",
      language: "TypeScript",
      stargazers_count: 1500,
      topics: ["agent"],
      pushed_at: "2026-07-30T10:00:00Z",
    });
    expect(acquired.metadata).toEqual({
      fullName: "acme/agent-kit",
      htmlUrl: "https://github.com/acme/agent-kit",
      description: "An agent harness",
      language: "TypeScript",
      stargazersCount: 1500,
      topics: ["agent"],
      pushedAt: "2026-07-30T10:00:00Z",
    });
    expect(acquired.item.subject.profile).toEqual({
      description: "An agent harness",
      keywords: ["agent", "TypeScript"],
      popularity: 1500,
      lastActiveAt: "2026-07-30T10:00:00Z",
    });
    expect(acquired.item.display.facts).toEqual(["⭐ 1.5k"]);
  });

  it("maps pull request details and followed accounts", () => {
    const pull = acquirePullRequest(
      {
        title: "feat: add search",
        html_url: "https://github.com/acme/agent-kit/pull/12",
        body: "Adds search.",
      },
      "acme/agent-kit",
      12,
    );
    expect(pull.details).toEqual({
      title: "feat: add search",
      htmlUrl: "https://github.com/acme/agent-kit/pull/12",
      body: "Adds search.",
    });
    expect(pull.item.subject.key).toBe("github-pull-request:acme/agent-kit:12");

    const followed = acquireFollowing([{ login: "ada" }, { login: "" }, {}]);
    expect(followed.logins).toEqual(["ada"]);
    expect(followed.items[0]?.provenance.actor).toEqual({ name: "ada", followed: true });
  });
});

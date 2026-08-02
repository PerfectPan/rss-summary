import { describe, expect, it } from "vitest";

import { GitHubClient } from "../src/infrastructure/github.js";

describe("GitHubClient", () => {
  it("fetches received events as the configured username with bearer auth", async () => {
    const calls: Array<{ url: string; auth: string | null }> = [];
    const client = new GitHubClient({
      token: "token-1",
      fetch: async (url, init) => {
        calls.push({
          url: String(url),
          auth: new Headers(init?.headers).get("authorization"),
        });
        return new Response(JSON.stringify([{ id: "evt-1" }]), { status: 200 });
      },
    });

    const events = await client.getReceivedEvents("PerfectPan", { perPage: 100, pages: 1 });

    expect(events).toEqual([{ id: "evt-1" }]);
    expect(calls).toEqual([
      {
        url: "https://api.github.com/users/PerfectPan/received_events?per_page=100&page=1",
        auth: "Bearer token-1",
      },
    ]);
  });

  it("parses repository metadata", async () => {
    const client = new GitHubClient({
      fetch: async () =>
        new Response(
          JSON.stringify({
            full_name: "acme/agent-kit",
            html_url: "https://github.com/acme/agent-kit",
            description: "An agent harness",
            language: "TypeScript",
            stargazers_count: 123,
            topics: ["agent"],
            pushed_at: "2026-07-30T10:00:00Z",
          }),
          { status: 200 },
        ),
    });

    await expect(client.getRepository("acme/agent-kit")).resolves.toEqual({
      fullName: "acme/agent-kit",
      htmlUrl: "https://github.com/acme/agent-kit",
      description: "An agent harness",
      language: "TypeScript",
      stargazersCount: 123,
      topics: ["agent"],
      pushedAt: "2026-07-30T10:00:00Z",
    });
  });

  it("parses pull request details", async () => {
    const client = new GitHubClient({
      fetch: async () =>
        new Response(
          JSON.stringify({
            title: "feat: add search",
            html_url: "https://github.com/acme/agent-kit/pull/12",
            body: "Adds search.",
          }),
          { status: 200 },
        ),
    });

    await expect(client.getPullRequest("acme/agent-kit", 12)).resolves.toEqual({
      title: "feat: add search",
      htmlUrl: "https://github.com/acme/agent-kit/pull/12",
      body: "Adds search.",
    });
  });

  it("deduplicates the following list across pages", async () => {
    const client = new GitHubClient({
      fetch: async (url, init) => {
        const page = new URL(String(url)).searchParams.get("page");
        const logins = page === "1" ? [{ login: "a" }, { login: "b" }] : [{ login: "b" }, { login: "c" }];
        return new Response(JSON.stringify(logins), { status: 200 });
      },
    });

    await expect(client.getFollowing({ perPage: 100, pages: 2 })).resolves.toEqual(new Set(["a", "b", "c"]));
  });

  it("fails with the truncated API body on non-OK responses", async () => {
    const client = new GitHubClient({
      fetch: async () => new Response("rate limit reached, retry later", { status: 403 }),
    });

    await expect(client.getRepository("acme/agent-kit")).rejects.toThrow(
      /403.*rate limit reached, retry later/,
    );
  });
});

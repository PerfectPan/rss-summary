import { describe, expect, it, vi } from "vitest";

import { buildRepositorySearchQuery, GitHubSearchClient } from "../../src/infrastructure/github-search.js";

const fixture = {
  total_count: 1,
  incomplete_results: false,
  items: [
    {
      id: 1316527318,
      full_name: "yc-software/qm",
      html_url: "https://github.com/yc-software/qm",
      description: "Multiplayer agent harness for TypeScript",
      language: "TypeScript",
      stargazers_count: 1234,
      created_at: "2026-07-30T10:00:00Z",
      topics: ["agent", "typescript"],
    },
  ],
};

describe("GitHubSearchClient", () => {
  it("searches repositories with bearer auth when a token is configured", async () => {
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url));
      expect(parsed.pathname).toBe("/search/repositories");
      expect(parsed.searchParams.get("q")).toContain("stars:>50");
      expect(parsed.searchParams.get("sort")).toBe("stars");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token-1");
      return new Response(JSON.stringify(fixture), { status: 200 });
    });

    const repos = await new GitHubSearchClient({ token: "token-1", fetch }).searchRepositories({
      query: "created:>=2026-07-26 stars:>50 (language:TypeScript OR topic:ai)",
      perPage: 8,
    });

    expect(repos).toEqual([
      {
        fullName: "yc-software/qm",
        htmlUrl: "https://github.com/yc-software/qm",
        description: "Multiplayer agent harness for TypeScript",
        language: "TypeScript",
        stars: 1234,
        createdAt: "2026-07-30T10:00:00Z",
        topics: ["agent", "typescript"],
      },
    ]);
  });

  it("rejects non-OK responses and drops items without identity", async () => {
    const client = new GitHubSearchClient({
      fetch: async () => new Response(JSON.stringify({ items: [{ description: "no identity" }] }), { status: 200 }),
    });
    await expect(client.searchRepositories({ query: "stars:>50", perPage: 8 })).resolves.toEqual([]);

    const failing = new GitHubSearchClient({
      fetch: async () => new Response("rate limited", { status: 403 }),
    });
    await expect(failing.searchRepositories({ query: "stars:>50", perPage: 8 })).rejects.toThrow(/403/);
  });
});

describe("buildRepositorySearchQuery", () => {
  it("combines the created window, star floor, and free-text keyword OR terms", () => {
    expect(
      buildRepositorySearchQuery({
        since: "2026-07-26",
        minStars: 50,
        keywords: ["TypeScript", "ai", "mcp"],
      }),
    ).toBe("created:>=2026-07-26 stars:>50 TypeScript OR ai OR mcp");
  });
});

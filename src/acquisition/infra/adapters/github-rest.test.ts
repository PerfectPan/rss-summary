import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { GitHubCatalog } from "../../application/ports.js";
import { GitHubCatalogLive, readReceivedEvents } from "./github-rest.js";

const options = (fetchImpl: typeof fetch) => ({ token: "token-1", fetch: fetchImpl });

describe("GitHub REST adapter", () => {
  it("fetches received events as the configured username with bearer auth", async () => {
    const calls: Array<{ url: string; auth: string | null }> = [];
    const events = await Effect.runPromise(
      readReceivedEvents(
        "PerfectPan",
        { perPage: 100, pages: 1 },
        {
          token: "token-1",
          fetch: async (url, init) => {
            calls.push({
              url: String(url),
              auth: new Headers(init?.headers).get("authorization"),
            });
            return new Response(JSON.stringify([{ id: "evt-1" }]), { status: 200 });
          },
        },
      ),
    );

    expect(events).toEqual([{ id: "evt-1" }]);
    expect(calls).toEqual([
      {
        url: "https://api.github.com/users/PerfectPan/received_events?per_page=100&page=1",
        auth: "Bearer token-1",
      },
    ]);
  });

  it("parses repository metadata", async () => {
    const repository = await Effect.runPromise(
      Effect.provide(
        GitHubCatalog.use((github) => github.getRepository("acme/agent-kit")),
        GitHubCatalogLive(
          options(
            async () =>
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
          ),
        ),
      ),
    );
    await expect(Promise.resolve(repository)).resolves.toEqual({
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
    const pullRequest = await Effect.runPromise(
      Effect.provide(
        GitHubCatalog.use((github) => github.getPullRequest("acme/agent-kit", 12)),
        GitHubCatalogLive(
          options(
            async () =>
              new Response(
                JSON.stringify({
                  title: "feat: add search",
                  html_url: "https://github.com/acme/agent-kit/pull/12",
                  body: "Adds search.",
                }),
                { status: 200 },
              ),
          ),
        ),
      ),
    );
    await expect(Promise.resolve(pullRequest)).resolves.toEqual({
      title: "feat: add search",
      htmlUrl: "https://github.com/acme/agent-kit/pull/12",
      body: "Adds search.",
    });
  });

  it("deduplicates the following list across pages", async () => {
    const following = await Effect.runPromise(
      Effect.provide(
        GitHubCatalog.use((github) => github.getFollowing({ perPage: 100, pages: 2 })),
        GitHubCatalogLive(
          options(async (url, _init) => {
            const page = new URL(String(url)).searchParams.get("page");
            const logins =
              page === "1" ? [{ login: "a" }, { login: "b" }] : [{ login: "b" }, { login: "c" }];
            return new Response(JSON.stringify(logins), { status: 200 });
          }),
        ),
      ),
    );
    await expect(Promise.resolve(following)).resolves.toEqual(new Set(["a", "b", "c"]));
  });

  it("fails with the truncated API body on non-OK responses", async () => {
    await expect(
      Effect.runPromise(
        Effect.provide(
          GitHubCatalog.use((github) => github.getRepository("acme/agent-kit")),
          GitHubCatalogLive(
            options(async () => new Response("rate limit reached, retry later", { status: 403 })),
          ),
        ),
      ),
    ).rejects.toThrow(/403.*rate limit reached, retry later/);
  });
});

import { describe, expect, it } from "vitest";

import { GitHubClient } from "../src/github.js";

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
});

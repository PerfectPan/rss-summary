import { describe, it, vi } from "vite-plus/test";

import { WINDOW_SINCE, WINDOW_UNTIL } from "./fixtures.js";
import {
  installFetch,
  jsonResponse,
  matchSnapshot,
  runCommand,
  textResponse,
  useGoldenHarness,
} from "./harness.js";
import { nextUuid } from "./uuid-sequence.js";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: (() => nextUuid()) as typeof actual.randomUUID };
});

const harness = useGoldenHarness();
const at = "2026-08-15T02:00:00Z";

describe("golden digest scoring", () => {
  it("snapshots events JSON scores, reasons, and presentation depth", async () => {
    process.env.FEED_INTERESTS = "rustlang,topicword,descword,compiler,abstractterm";
    process.env.GH_FEED_TOKEN = "golden-token";
    process.env.RSS_FEEDS = JSON.stringify([
      { name: "Compiler Notes", url: "https://example.com/compiler.xml", tags: ["notes"] },
      { name: "Weekly Notes", url: "https://example.com/weekly.xml", tags: ["notes"] },
      { name: "Paper Feed", url: "https://example.com/papers.xml", tags: ["papers"] },
    ]);
    installFetch((url) => {
      if (url === "https://example.com/compiler.xml") return textResponse(compilerFeed);
      if (url === "https://example.com/weekly.xml") return textResponse(weeklyFeed);
      if (url === "https://example.com/papers.xml") return textResponse(paperFeed);
      if (url.includes("/received_events")) return jsonResponse(events);
      if (url.includes("/user/following")) {
        return jsonResponse(url.includes("page=1") ? [{ login: "alice" }, { login: "bob" }] : []);
      }
      const pull = url.match(/\/repos\/([^/]+\/[^/]+)\/pulls\/(\d+)$/u);
      if (pull) {
        const body = pullBodies[`${pull[1]}#${pull[2]}`];
        if (!body) throw new Error(`Unexpected pull request ${url}`);
        return jsonResponse(body);
      }
      const repo = url.match(/\/repos\/([^/]+\/[^/]+)$/u);
      if (repo) {
        const body = repositories[repo[1] ?? ""];
        if (!body) throw new Error(`Unexpected repository ${url}`);
        return jsonResponse(body);
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const context = harness.context();
    const capture = await runCommand(
      ["digest", "--json", "--since", WINDOW_SINCE, "--until", WINDOW_UNTIL, "--pages", "1"],
      context,
    );
    await matchSnapshot("digest-events-scoring-json.txt", capture, [context.root]);
  });
});

const repositories: Record<string, Record<string, unknown>> = {
  "alpha/watch-one": repo("alpha/watch-one", 1_000, "2026-08-15T00:00:00Z", {
    language: "RustLang",
  }),
  "alpha/watch-many": repo("alpha/watch-many", 10, "2026-07-01T00:00:00Z"),
  "alpha/watch-stranger": repo("alpha/watch-stranger", 10, "2026-07-01T00:00:00Z"),
  "alpha/watch-topic": repo("alpha/watch-topic", 10, "2026-07-01T00:00:00Z", {
    topics: ["topicword"],
  }),
  "alpha/watch-desc": repo("alpha/watch-desc", 10, "2026-07-01T00:00:00Z", {
    description: "A descword project",
  }),
  "beta/release": repo("beta/release", 100_000_000, "2026-08-02T04:00:00.000Z"),
  "beta/release-stale": repo("beta/release-stale", 1_000, "2026-08-02T03:59:59.000Z"),
  "gamma/fork": repo("gamma/fork", 1, "2026-07-01T00:00:00Z"),
  "gamma/create": repo("gamma/create", 1, "2026-07-01T00:00:00Z"),
  "delta/merged": repo("delta/merged", 10, "2026-07-01T00:00:00Z", { language: "Go" }),
  "delta/opened": repo("delta/opened", 10, "2026-07-01T00:00:00Z", { language: "Go" }),
  "delta/closed": repo("delta/closed", 10, "2026-07-01T00:00:00Z", { language: "Go" }),
  "delta/labeled": repo("delta/labeled", 10, "2026-07-01T00:00:00Z", { language: "Go" }),
};

const pullBodies: Record<string, Record<string, unknown>> = {
  "delta/merged#1": pull("delta/merged", 1, "Compiler pipeline tweak", "Adjusts the pipeline."),
  "delta/opened#2": pull("delta/opened", 2, "Rename helper", "Renames an internal helper."),
  "delta/closed#3": pull("delta/closed", 3, "Drop flag", "Removes an unused flag."),
  "delta/labeled#4": pull("delta/labeled", 4, "Chore", "Updates a comment."),
};

const events = [
  watch("1001", "alice", "alpha/watch-one"),
  watch("1002", "alice", "alpha/watch-many"),
  watch("1003", "bob", "alpha/watch-many"),
  watch("1004", "dave", "alpha/watch-stranger"),
  watch("1005", "dave", "alpha/watch-topic"),
  watch("1006", "dave", "alpha/watch-desc"),
  release("2001", "dave", "beta/release"),
  release("2002", "dave", "beta/release-stale"),
  {
    id: "3001",
    type: "ForkEvent",
    actor: { login: "alice" },
    repo: { name: "gamma/fork" },
    created_at: at,
    payload: {},
  },
  {
    id: "3002",
    type: "CreateEvent",
    actor: { login: "dave" },
    repo: { name: "gamma/create" },
    created_at: at,
    payload: { ref_type: "repository" },
  },
  pullEvent("4001", "dave", "delta/merged", "merged", 1),
  pullEvent("4002", "dave", "delta/opened", "opened", 2),
  pullEvent("4003", "dave", "delta/closed", "closed", 3),
  pullEvent("4004", "dave", "delta/labeled", "labeled", 4),
];

const compilerFeed = feed(
  "Compiler Notes",
  "https://example.com/compiler-item",
  "Compiler notes for agents",
  "A note about the pipeline.",
);
const weeklyFeed = feed(
  "Weekly Notes",
  "https://example.com/weekly-item",
  "Weekly notes",
  "A routine weekly note.",
);
const paperFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Paper Feed</title>
    <item>
      <title>Unrelated title</title>
      <link>https://example.com/paper-abstract</link>
      <guid>https://example.com/paper-abstract</guid>
      <pubDate>Sat, 15 Aug 2026 02:00:00 GMT</pubDate>
      <description>The abstract covers abstractterm.</description>
    </item>
    <item>
      <title>Notes on abstractterm</title>
      <link>https://example.com/paper-title</link>
      <guid>https://example.com/paper-title</guid>
      <pubDate>Sat, 15 Aug 2026 02:00:00 GMT</pubDate>
      <description>Nothing relevant in the body.</description>
    </item>
  </channel>
</rss>
`;

function repo(
  name: string,
  stars: number,
  pushedAt: string,
  extra: { description?: string; language?: string; topics?: string[] } = {},
): Record<string, unknown> {
  return {
    full_name: name,
    html_url: `https://github.com/${name}`,
    description: extra.description ?? "plain",
    language: extra.language ?? null,
    stargazers_count: stars,
    topics: extra.topics ?? [],
    pushed_at: pushedAt,
  };
}

function pull(name: string, number: number, title: string, body: string): Record<string, unknown> {
  return {
    title,
    html_url: `https://github.com/${name}/pull/${number}`,
    body,
  };
}

function watch(id: string, actor: string, name: string) {
  return {
    id,
    type: "WatchEvent",
    actor: { login: actor },
    repo: { name },
    created_at: at,
    payload: { action: "started" },
  };
}

function release(id: string, actor: string, name: string) {
  return {
    id,
    type: "ReleaseEvent",
    actor: { login: actor },
    repo: { name },
    created_at: at,
    payload: {
      action: "published",
      release: {
        name: "v1",
        tag_name: "v1",
        html_url: `https://github.com/${name}/releases/v1`,
        body: "Release notes",
      },
    },
  };
}

function pullEvent(id: string, actor: string, name: string, action: string, number: number) {
  return {
    id,
    type: "PullRequestEvent",
    actor: { login: actor },
    repo: { name },
    created_at: at,
    payload: {
      action,
      number,
      pull_request: {
        title: "placeholder",
        html_url: `https://github.com/${name}/pull/${number}`,
        body: "placeholder",
      },
    },
  };
}

function feed(name: string, link: string, title: string, description: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${name}</title>
    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid>${link}</guid>
      <pubDate>Sat, 15 Aug 2026 02:00:00 GMT</pubDate>
      <description>${description}</description>
    </item>
  </channel>
</rss>
`;
}

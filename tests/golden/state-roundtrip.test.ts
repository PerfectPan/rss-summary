import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vite-plus/test";

import { saveDailyAiDiagnostics } from "../../src/delivery/index.js";
import { saveRunArtifact, loadRunArtifact } from "../../src/delivery/index.js";
import { loadFeedState, saveFeedState } from "../../src/delivery/index.js";
import {
  RSS_SUMMARY_DAILY_AI_TOOL_ID,
  RSS_SUMMARY_NEWS_TOOL_ID,
} from "../../src/app/rivus/plugin.js";
import {
  DOUBAO_URL,
  doubaoPayload,
  GITHUB_REPOSITORY,
  grokStream,
  INDUSTRY_ATOM,
  INDUSTRY_FEED_URL,
  INDUSTRY_PAGE_HTML,
  INDUSTRY_PAGE_URL,
  PERSONAL_FEED_URL,
  PERSONAL_RSS,
  WINDOW_SINCE,
  WINDOW_UNTIL,
} from "./fixtures.js";
import {
  executeTool,
  installFetch,
  jsonResponse,
  readTree,
  registerPlugin,
  runCommand,
  textResponse,
  useGoldenHarness,
  writeGrokExecutable,
} from "./harness.js";
import { nextUuid } from "./uuid-sequence.js";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: (() => nextUuid()) as typeof actual.randomUUID };
});

const fixtureRoot = fileURLToPath(new URL("../fixtures/state/", import.meta.url));
const harness = useGoldenHarness();
const windowArgs = ["--since", WINDOW_SINCE, "--until", WINDOW_UNTIL];
const runJson = "runs/2026-08-16/subscriptions-040000-00000000.json";
const runMarkdown = "runs/2026-08-16/subscriptions-040000-00000000.md";

describe("state fixtures", () => {
  it("roundtrips feed state and the subscription run record", async () => {
    installFetch((url) => {
      if (url === PERSONAL_FEED_URL) return textResponse(PERSONAL_RSS);
      if (url.includes("/received_events")) return jsonResponse([]);
      if (url === "https://api.github.com/repos/example/project")
        return jsonResponse(GITHUB_REPOSITORY);
      if (url.includes("/user/following")) return jsonResponse([]);
      throw new Error(`Unexpected fetch ${url}`);
    });
    const context = harness.context();
    await runCommand(
      ["digest", "--rss-only", "--only-new", ...windowArgs, "--pages", "1"],
      context,
    );

    expect(readGenerated(context.root, "feed-state.json")).toBe(readFixture("feed-state.json"));
    expect(readGenerated(context.root, runJson)).toBe(readFixture(runJson));
    expect(readGenerated(context.root, runMarkdown)).toBe(readFixture(runMarkdown));

    const feedCopy = join(context.root, "roundtrip", "feed-state.json");
    saveFeedState(feedCopy, loadFeedState(join(fixtureRoot, "feed-state.json")));
    expect(readFileSync(feedCopy, "utf8")).toBe(readFixture("feed-state.json"));

    const stored = loadRunArtifact(join(fixtureRoot, runJson));
    const { delivery, ...audit } = stored;
    const saved = saveRunArtifact(
      join(context.root, "roundtrip-runs"),
      audit,
      delivery,
      readFixture(runMarkdown),
    );
    expect(readFileSync(saved.jsonPath, "utf8")).toBe(readFixture(runJson));
    expect(readFileSync(saved.markdownPath, "utf8")).toBe(readFixture(runMarkdown));
  });

  it("roundtrips industry state", async () => {
    installIndustryFetch();
    const context = harness.context();
    await runCommand(["industry", "--json", "--only-new", ...windowArgs], context);

    expect(readGenerated(context.root, "industry-state.json")).toBe(
      readFixture("industry-state.json"),
    );
    const copy = join(context.root, "roundtrip", "industry-state.json");
    saveFeedState(copy, loadFeedState(join(fixtureRoot, "industry-state.json")));
    expect(readFileSync(copy, "utf8")).toBe(readFixture("industry-state.json"));
  });

  it("regenerates news-search.json and keeps the fixture bytes on a cache hit", async () => {
    const context = harness.context();
    process.env.NEWS_SEARCH_MODE = "doubao";
    process.env.DOUBAO_SEARCH_API_KEY = "golden-key";
    installFetch((url) => {
      if (url === DOUBAO_URL)
        return jsonResponse(JSON.parse(doubaoPayload("2026-08-16T02:00:00.000Z")));
      throw new Error(`Unexpected fetch ${url}`);
    });
    const { tools } = registerPlugin();
    const input = { edition: "noon" as const, occurrence: "2026-08-16T04:00:00.000Z" };
    await executeTool(tools, RSS_SUMMARY_NEWS_TOOL_ID, input);
    const stateFile = join(context.root, "news-search.json");
    expect(readFileSync(stateFile, "utf8")).toBe(readFixture("news-search.json"));

    await executeTool(tools, RSS_SUMMARY_NEWS_TOOL_ID, input);
    expect(readFileSync(stateFile, "utf8")).toBe(readFixture("news-search.json"));
  });

  it("roundtrips the daily AI diagnostic snapshot", async () => {
    const context = harness.context();
    await writeGrokExecutable(
      join(context.root, "grok"),
      grokStream({
        author: "@ClaudeDevs",
        publishedAt: "2026-08-15T12:00:00.000Z",
        summary: "Claude 更新了 TypeScript 工具链的具体工作流。",
        title: "Claude 更新了 TypeScript 工具链",
      }),
    );
    process.env.DAILY_AI_X_HANDLES = "ClaudeDevs";
    process.env.X_ACCOUNT_POSTS_PER_FETCH = "1";
    process.env.NEWS_SEARCH_MODE = "grok";
    installIndustryFetch();
    const { tools } = registerPlugin();
    await executeTool(tools, RSS_SUMMARY_DAILY_AI_TOOL_ID, {
      occurrence: "2026-08-16T04:00:00.000Z",
      phase: "collect",
    });

    const generatedPath = Object.keys(readTree(context.root)).find((path) =>
      path.endsWith("-collect.json"),
    );
    if (!generatedPath) throw new Error("collect did not write a diagnostic snapshot");
    const fixtureName = `daily-ai/${generatedPath.split("/").at(-1)}`;
    expect(readGenerated(context.root, generatedPath)).toBe(readFixture(fixtureName));

    const snapshot: Parameters<typeof saveDailyAiDiagnostics>[0] = JSON.parse(
      readFixture(fixtureName),
    );
    const directory = join(context.root, "roundtrip-rivus");
    await saveDailyAiDiagnostics(snapshot, { RIVUS_DEPLOYMENT_STATE_DIR: directory });
    const written = Object.values(readTree(directory));
    expect(written).toEqual([readFixture(fixtureName)]);
  });
});

function installIndustryFetch(): void {
  installFetch((url) => {
    if (url === INDUSTRY_FEED_URL) return textResponse(INDUSTRY_ATOM, 200, "application/atom+xml");
    if (url === INDUSTRY_PAGE_URL) return textResponse(INDUSTRY_PAGE_HTML, 200, "text/html");
    throw new Error(`Unexpected fetch ${url}`);
  });
}

function readFixture(path: string): string {
  return readFileSync(join(fixtureRoot, path), "utf8");
}

function readGenerated(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}

import { join } from "node:path";

import { describe, it, vi } from "vite-plus/test";

import { RSS_SUMMARY_NEWS_TOOL_ID } from "../../src/app/rivus/plugin.js";
import { DOUBAO_URL, doubaoPayload, grokStream } from "./fixtures.js";
import {
  errorRecord,
  executeTool,
  grokInvocationCount,
  installFetch,
  jsonResponse,
  matchSnapshot,
  readTree,
  registerPlugin,
  useGoldenHarness,
  writeGrokExecutable,
} from "./harness.js";
import { nextUuid } from "./uuid-sequence.js";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: (() => nextUuid()) as typeof actual.randomUUID };
});

const harness = useGoldenHarness();

describe("golden news tool", () => {
  it("snapshots a Doubao noon brief", async () => {
    await matchDoubao("news-doubao-noon.txt", {
      edition: "noon",
      occurrence: "2026-08-16T04:00:00.000Z",
      publishTime: "2026-08-16T02:00:00.000Z",
    });
  });

  it("snapshots a Doubao evening brief", async () => {
    await matchDoubao("news-doubao-evening.txt", {
      edition: "evening",
      occurrence: "2026-08-16T12:00:00.000Z",
      publishTime: "2026-08-16T08:00:00.000Z",
    });
  });

  it("snapshots a Doubao catch-up window", async () => {
    await matchDoubao("news-doubao-catchup.txt", {
      edition: "evening",
      occurrence: "2026-08-16T12:00:00.000Z",
      publishTime: "2026-08-16T02:00:00.000Z",
      since: "2026-08-15T12:00:00.000Z",
    });
  });

  it("snapshots an exhausted Doubao budget without calling the provider", async () => {
    const context = harness.context();
    process.env.NEWS_SEARCH_MODE = "doubao";
    process.env.DOUBAO_SEARCH_API_KEY = "golden-key";
    process.env.NEWS_SEARCH_DAILY_LIMIT = "0";
    let fetches = 0;
    installFetch(() => {
      fetches += 1;
      throw new Error("budget exhaustion must not fetch");
    });
    const { tools } = registerPlugin();
    const result = await executeTool(tools, RSS_SUMMARY_NEWS_TOOL_ID, {
      edition: "noon",
      occurrence: "2026-08-16T04:00:00.000Z",
    });
    await matchSnapshot(
      "news-doubao-budget-exhausted.txt",
      { fetches, result, state: readTree(context.root) },
      [context.root],
    );
  });

  it("reuses a Grok cache entry on the second identical brief", async () => {
    const context = harness.context();
    const executable = join(context.root, "grok");
    process.env.NEWS_SEARCH_MODE = "grok";
    process.env.NEWS_GROK_MAX_QUERIES = "1";
    await writeGrokExecutable(
      executable,
      grokStream({
        author: "@OpenAI",
        publishedAt: "2026-08-16T02:00:00.000Z",
        summary: "OpenAI 正式发布新模型，并开放 API。",
        title: "OpenAI 正式发布新模型",
      }),
    );
    const { tools } = registerPlugin();
    const input = { edition: "noon", occurrence: "2026-08-16T04:00:00.000Z" };
    const first = await executeTool(tools, RSS_SUMMARY_NEWS_TOOL_ID, input);
    const second = await executeTool(tools, RSS_SUMMARY_NEWS_TOOL_ID, input);
    await matchSnapshot(
      "news-grok-success-and-cache.txt",
      {
        first,
        grokInvocations: grokInvocationCount(executable),
        second,
        state: readTree(context.root),
      },
      [context.root],
    );
  });

  it("throws AllNewsQueriesFailedError when every Grok query fails", async () => {
    const context = harness.context();
    process.env.NEWS_SEARCH_MODE = "grok";
    process.env.NEWS_GROK_MAX_QUERIES = "1";
    await writeGrokExecutable(join(context.root, "grok"), "not-json\n");
    const { tools } = registerPlugin();
    let thrown: unknown;
    try {
      await executeTool(tools, RSS_SUMMARY_NEWS_TOOL_ID, {
        edition: "noon",
        occurrence: "2026-08-16T04:00:00.000Z",
      });
    } catch (error) {
      thrown = error;
    }
    await matchSnapshot(
      "news-grok-all-failed.txt",
      { error: errorRecord(thrown), state: readTree(context.root) },
      [context.root],
    );
  });
});

async function matchDoubao(
  name: string,
  input: { edition: "noon" | "evening"; occurrence: string; publishTime: string; since?: string },
): Promise<void> {
  const context = harness.context();
  process.env.NEWS_SEARCH_MODE = "doubao";
  process.env.DOUBAO_SEARCH_API_KEY = "golden-key";
  installFetch((url) => {
    if (url === DOUBAO_URL) return jsonResponse(JSON.parse(doubaoPayload(input.publishTime)));
    throw new Error(`Unexpected fetch ${url}`);
  });
  const { tools } = registerPlugin();
  const result = await executeTool(tools, RSS_SUMMARY_NEWS_TOOL_ID, {
    edition: input.edition,
    occurrence: input.occurrence,
    ...(input.since ? { since: input.since } : {}),
  });
  await matchSnapshot(name, { result, state: readTree(context.root) }, [context.root]);
}

import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, it, vi } from "vite-plus/test";

import { RSS_SUMMARY_NEWS_TOOL_ID } from "../../src/app/rivus/plugin.js";
import {
  DEEPSEEK_URL,
  DOUBAO_URL,
  deepSeekPayload,
  doubaoPayload,
  grokStream,
} from "./fixtures.js";
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

  it("falls back to DeepSeek when Doubao answers 5xx", async () => {
    const context = harness.context();
    process.env.NEWS_SEARCH_MODE = "doubao";
    process.env.DOUBAO_SEARCH_API_KEY = "golden-key";
    process.env.NEWS_SEARCH_FALLBACK = "deepseek";
    process.env.DEEPSEEK_API_KEY = "golden-deepseek";
    installFetch((url) => {
      if (url === DOUBAO_URL) return new Response("down", { status: 500 });
      if (url === DEEPSEEK_URL)
        return jsonResponse(JSON.parse(deepSeekPayload("2026-08-16T02:00:00.000Z")));
      throw new Error(`Unexpected fetch ${url}`);
    });
    const { tools } = registerPlugin();
    const result = await executeTool(tools, RSS_SUMMARY_NEWS_TOOL_ID, {
      edition: "noon",
      occurrence: "2026-08-16T04:00:00.000Z",
    });
    await matchSnapshot(
      "news-deepseek-fallback-doubao-5xx.txt",
      { result, state: readTree(context.root) },
      [context.root],
    );
  });

  it("falls back to DeepSeek when Grok times out", async () => {
    const context = harness.context();
    const executable = join(context.root, "grok");
    process.env.NEWS_SEARCH_MODE = "grok";
    process.env.NEWS_GROK_MAX_QUERIES = "1";
    process.env.NEWS_GROK_TIMEOUT_MS = "1000";
    process.env.NEWS_SEARCH_FALLBACK = "deepseek";
    process.env.DEEPSEEK_API_KEY = "golden-deepseek";
    await writeHangingGrokExecutable(executable);
    installFetch((url) => {
      if (url === DEEPSEEK_URL)
        return jsonResponse(JSON.parse(deepSeekPayload("2026-08-16T02:00:00.000Z")));
      throw new Error(`Unexpected fetch ${url}`);
    });
    const { tools } = registerPlugin();
    const result = await executeTool(tools, RSS_SUMMARY_NEWS_TOOL_ID, {
      edition: "noon",
      occurrence: "2026-08-16T04:00:00.000Z",
    });
    await matchSnapshot(
      "news-deepseek-fallback-grok-timeout.txt",
      { grokInvocations: grokInvocationCount(executable), result, state: readTree(context.root) },
      [context.root],
    );
  });

  it("does not spend the DeepSeek fallback when the primary ledger is exhausted", async () => {
    const context = harness.context();
    process.env.NEWS_SEARCH_MODE = "doubao";
    process.env.DOUBAO_SEARCH_API_KEY = "golden-key";
    process.env.NEWS_SEARCH_FALLBACK = "deepseek";
    process.env.DEEPSEEK_API_KEY = "golden-deepseek";
    process.env.NEWS_SEARCH_DAILY_LIMIT = "0";
    const fetches = { doubao: 0, deepseek: 0 };
    installFetch((url) => {
      if (url === DEEPSEEK_URL) fetches.deepseek += 1;
      else fetches.doubao += 1;
      throw new Error("budget exhaustion must not fetch");
    });
    const { tools } = registerPlugin();
    const result = await executeTool(tools, RSS_SUMMARY_NEWS_TOOL_ID, {
      edition: "noon",
      occurrence: "2026-08-16T04:00:00.000Z",
    });
    await matchSnapshot(
      "news-deepseek-fallback-budget-exhausted.txt",
      { fetches, result, state: readTree(context.root) },
      [context.root],
    );
  });

  it("keeps the primary failure for official topics the DeepSeek fallback cannot serve", async () => {
    const context = harness.context();
    process.env.NEWS_SEARCH_MODE = "doubao";
    process.env.DOUBAO_SEARCH_API_KEY = "golden-key";
    process.env.NEWS_SEARCH_FALLBACK = "deepseek";
    process.env.DEEPSEEK_API_KEY = "golden-deepseek";
    const topicsFile = join(context.root, "official-topics.json");
    await writeFile(
      topicsFile,
      `${JSON.stringify(
        [
          {
            id: "official-announcements",
            label: "官方发布",
            icon: "📰",
            enabled: true,
            sourcePolicy: "official",
            maxItems: 2,
            queries: [
              {
                id: "official-model-release",
                text: "OpenAI 正式发布新模型",
                intent: "model-release",
                subjectAny: ["OpenAI"],
                eventAny: ["正式发布"],
                excludedAny: ["传闻"],
              },
            ],
          },
        ],
        null,
        2,
      )}\n`,
    );
    process.env.NEWS_TOPICS_FILE = topicsFile;
    const deepseekFetches = { count: 0 };
    installFetch((url) => {
      if (url === DEEPSEEK_URL) {
        deepseekFetches.count += 1;
        return jsonResponse(JSON.parse(deepSeekPayload("2026-08-16T02:00:00.000Z")));
      }
      return new Response("down", { status: 500 });
    });
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
      "news-deepseek-fallback-official-topic.txt",
      {
        deepseekFetches: deepseekFetches.count,
        error: errorRecord(thrown),
        state: readTree(context.root),
      },
      [context.root],
    );
  });
});

/** Counts as an invocation, then outlives NEWS_GROK_TIMEOUT_MS so the CLI kills it. */
async function writeHangingGrokExecutable(path: string): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  const counter = `${path}.count`;
  const script = `#!${process.execPath}\nconst fs = require("node:fs");\nfs.appendFileSync(${JSON.stringify(counter)}, "1\\n");\nsetInterval(() => {}, 60000);\n`;
  await writeFile(path, script, { mode: 0o755 });
  process.env.NEWS_GROK_EXECUTABLE = path;
}

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

describe("golden news tool DeepSeek supplement", () => {
  function deepSeekResults(
    results: Array<{ title: string; url: string; date?: string | null }>,
  ): string {
    return JSON.stringify({
      results: results.map((result, index) => ({
        rerank_score: 2.4,
        title: result.title,
        url: result.url,
        snippet: `${result.title} snippet.`,
        summary: `${result.title}，并开放 API。`,
        content: "",
        site_name: new URL(result.url).hostname,
        site_icon: null,
        date: result.date === undefined ? "2026-08-15T16:00:00Z" : result.date,
        authority: 3,
        rank: index + 1,
      })),
    });
  }

  async function writeSupplementTopics(
    root: string,
    queries: Array<{ id: string; deepseek?: string[]; sourcePolicy?: string }>,
    sourcePolicy = "news",
  ): Promise<void> {
    const topicsFile = join(root, "supplement-topics.json");
    await writeFile(
      topicsFile,
      `${JSON.stringify(
        [
          {
            id: "ai-model-releases",
            label: "AI 模型与 Agent 发布",
            icon: "🤖",
            enabled: true,
            sourcePolicy,
            maxItems: 2,
            queries: queries.map((query) => ({
              id: query.id,
              text:
                query.id === "frontier-model-release"
                  ? "OpenAI 正式发布新模型"
                  : "Claude Code 发布重大版本",
              intent: query.id === "frontier-model-release" ? "model-release" : "developer-change",
              ...(query.deepseek ? { deepseek: { queries: query.deepseek } } : {}),
              subjectAny:
                query.id === "frontier-model-release" ? ["OpenAI"] : ["OpenAI", "Claude Code"],
              eventAny: ["正式发布"],
              excludedAny: ["传闻"],
            })),
          },
        ],
        null,
        2,
      )}\n`,
    );
    process.env.NEWS_TOPICS_FILE = topicsFile;
  }

  it("merges Grok and per-keyword DeepSeek pages for a selected query", async () => {
    const context = harness.context();
    process.env.NEWS_SEARCH_MODE = "grok";
    process.env.NEWS_GROK_MAX_QUERIES = "1";
    process.env.NEWS_SEARCH_SUPPLEMENT = "deepseek";
    process.env.DEEPSEEK_API_KEY = "golden-deepseek";
    await writeSupplementTopics(context.root, [
      { id: "frontier-model-release", deepseek: ["OpenAI 新模型", "OpenAI new model"] },
    ]);
    const executable = join(context.root, "grok");
    await writeGrokExecutable(
      executable,
      grokStream({
        author: "@OpenAI",
        publishedAt: "2026-08-16T02:00:00.000Z",
        summary: "OpenAI 正式发布新模型，并开放 API。",
        title: "OpenAI 正式发布新模型",
      }),
    );
    installFetch((url) => {
      if (url !== DEEPSEEK_URL) throw new Error(`Unexpected fetch ${url}`);
      return jsonResponse(
        JSON.parse(
          deepSeekResults([
            { title: "OpenAI 正式发布新模型", url: "https://openai.com/news/new-model" },
            { title: "OpenAI 正式发布新模型并开放 API", url: "https://example.com/deepseek-only" },
          ]),
        ),
      );
    });
    const { tools } = registerPlugin();
    // DeepSearch keeps its own ledger, so the audited usage counters come from
    // the Grok page alone and a single live run is deterministic.
    const result = await executeTool(tools, RSS_SUMMARY_NEWS_TOOL_ID, {
      edition: "noon",
      occurrence: "2026-08-16T04:00:00.000Z",
    });
    await matchSnapshot(
      "news-deepseek-supplement-merged.txt",
      { grokInvocations: grokInvocationCount(executable), result, state: readTree(context.root) },
      [context.root],
    );
  });

  it("answers a Grok outage with DeepSeek day-precision results only", async () => {
    const context = harness.context();
    process.env.NEWS_SEARCH_MODE = "grok";
    process.env.NEWS_GROK_MAX_QUERIES = "1";
    process.env.NEWS_SEARCH_SUPPLEMENT = "deepseek";
    process.env.DEEPSEEK_API_KEY = "golden-deepseek";
    await writeSupplementTopics(context.root, [
      { id: "frontier-model-release", deepseek: ["OpenAI 新模型"] },
    ]);
    const executable = join(context.root, "grok");
    await writeGrokExecutable(executable, "not-json\n");
    installFetch((url) => {
      if (url === DEEPSEEK_URL)
        return jsonResponse(
          JSON.parse(
            deepSeekResults([
              { title: "OpenAI 正式发布新模型", url: "https://openai.com/news/new-model" },
            ]),
          ),
        );
      throw new Error(`Unexpected fetch ${url}`);
    });
    const { tools } = registerPlugin();
    const result = await executeTool(tools, RSS_SUMMARY_NEWS_TOOL_ID, {
      edition: "noon",
      occurrence: "2026-08-16T04:00:00.000Z",
    });
    await matchSnapshot(
      "news-deepseek-supplement-grok-outage.txt",
      { result, state: readTree(context.root) },
      [context.root],
    );
  });

  it("runs DeepSeek alone for queries deferred by the Grok budget", async () => {
    const context = harness.context();
    process.env.NEWS_SEARCH_MODE = "grok";
    process.env.NEWS_GROK_MAX_QUERIES = "1";
    process.env.NEWS_SEARCH_SUPPLEMENT = "deepseek";
    process.env.DEEPSEEK_API_KEY = "golden-deepseek";
    // Only the deferred query carries supplement keywords, so the run has no
    // parallel reservations at all and the audit stays deterministic.
    await writeSupplementTopics(context.root, [
      { id: "frontier-model-release" },
      { id: "coding-agent-release", deepseek: ["Claude Code release"] },
    ]);
    const executable = join(context.root, "grok");
    await writeGrokExecutable(
      executable,
      grokStream({
        author: "@OpenAI",
        publishedAt: "2026-08-16T02:00:00.000Z",
        summary: "OpenAI 正式发布新模型，并开放 API。",
        title: "OpenAI 正式发布新模型",
      }),
    );
    installFetch((url) => {
      if (url !== DEEPSEEK_URL) throw new Error(`Unexpected fetch ${url}`);
      return jsonResponse(
        JSON.parse(
          deepSeekResults([
            { title: "OpenAI 正式发布新模型并开放 API", url: "https://example.com/supplement" },
          ]),
        ),
      );
    });
    const { tools } = registerPlugin();
    const result = await executeTool(tools, RSS_SUMMARY_NEWS_TOOL_ID, {
      edition: "noon",
      occurrence: "2026-08-16T04:00:00.000Z",
    });
    await matchSnapshot(
      "news-deepseek-supplement-deferred.txt",
      { grokInvocations: grokInvocationCount(executable), result, state: readTree(context.root) },
      [context.root],
    );
  });

  it("never supplements official-policy topics", async () => {
    const context = harness.context();
    process.env.NEWS_SEARCH_MODE = "doubao";
    process.env.DOUBAO_SEARCH_API_KEY = "golden-key";
    process.env.NEWS_SEARCH_SUPPLEMENT = "deepseek";
    process.env.DEEPSEEK_API_KEY = "golden-deepseek";
    await writeSupplementTopics(
      context.root,
      [{ id: "frontier-model-release", deepseek: ["OpenAI 新模型"] }],
      "official",
    );
    const deepseekFetches = { count: 0 };
    installFetch((url) => {
      if (url === DOUBAO_URL)
        return jsonResponse(JSON.parse(doubaoPayload("2026-08-16T02:00:00.000Z")));
      deepseekFetches.count += 1;
      throw new Error(`Unexpected fetch ${url}`);
    });
    const { tools } = registerPlugin();
    const result = await executeTool(tools, RSS_SUMMARY_NEWS_TOOL_ID, {
      edition: "noon",
      occurrence: "2026-08-16T04:00:00.000Z",
    });
    await matchSnapshot(
      "news-deepseek-supplement-official-topic.txt",
      { deepseekFetches: deepseekFetches.count, result, state: readTree(context.root) },
      [context.root],
    );
  });
});

import { join } from "node:path";

import { describe, it, vi } from "vite-plus/test";

import { RSS_SUMMARY_DAILY_AI_TOOL_ID } from "../../src/presentation/rivus-plugin.js";
import {
  grokStream,
  INDUSTRY_ATOM,
  INDUSTRY_FEED_URL,
  INDUSTRY_PAGE_HTML,
  INDUSTRY_PAGE_URL,
} from "./fixtures.js";
import {
  errorRecord,
  executeTool,
  grokInvocationCount,
  installFetch,
  matchSnapshot,
  readTree,
  registerPlugin,
  textResponse,
  useGoldenHarness,
  writeGrokExecutable,
} from "./harness.js";
import { nextUuid } from "./uuid-sequence.js";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: (() => nextUuid()) as typeof actual.randomUUID };
});

const harness = useGoldenHarness();
const occurrence = "2026-08-16T04:00:00.000Z";
const publishedAt = "2026-08-15T12:00:00.000Z";

describe("golden daily AI tool", () => {
  it("runs collect and render", async () => {
    const context = harness.context();
    const executable = join(context.root, "grok");
    await installDailyAi(executable);
    const { tools } = registerPlugin();
    const collected = await executeTool(tools, RSS_SUMMARY_DAILY_AI_TOOL_ID, {
      occurrence,
      phase: "collect",
    });
    const evidence = evidenceOf(collected);
    const first = evidence[0];
    if (!first) throw new Error("collect did not return evidence");
    const rendered = await executeTool(tools, RSS_SUMMARY_DAILY_AI_TOOL_ID, {
      draft: [
        { category: "模型发布", headline: "Claude 更新了 TypeScript 工具链", refs: [first.id] },
      ],
      occurrence,
      phase: "render",
    });
    await matchSnapshot(
      "daily-ai-phases.txt",
      {
        collected,
        grokInvocations: grokInvocationCount(executable),
        rendered,
        state: readTree(context.root),
      },
      [context.root],
    );
  });

  it("throws DAILY_AI_DRAFT_VALIDATION_FAILED when every draft item is invalid", async () => {
    const context = harness.context();
    await installDailyAi(join(context.root, "grok"));
    const { tools } = registerPlugin();
    await executeTool(tools, RSS_SUMMARY_DAILY_AI_TOOL_ID, { occurrence, phase: "collect" });
    let thrown: unknown;
    try {
      await executeTool(tools, RSS_SUMMARY_DAILY_AI_TOOL_ID, {
        draft: [{ category: "不存在", headline: "", refs: ["missing"] }],
        occurrence,
        phase: "render",
      });
    } catch (error) {
      thrown = error;
    }
    await matchSnapshot(
      "daily-ai-draft-validation.txt",
      { error: errorRecord(thrown), state: readTree(context.root) },
      [context.root],
    );
  });
});

async function installDailyAi(executable: string): Promise<void> {
  process.env.DAILY_AI_X_HANDLES = "ClaudeDevs";
  process.env.X_ACCOUNT_POSTS_PER_FETCH = "1";
  process.env.NEWS_SEARCH_MODE = "grok";
  await writeGrokExecutable(
    executable,
    grokStream({
      author: "@ClaudeDevs",
      publishedAt,
      summary: "Claude 更新了 TypeScript 工具链的具体工作流。",
      title: "Claude 更新了 TypeScript 工具链",
    }),
  );
  installFetch((url) => {
    if (url === INDUSTRY_FEED_URL) return textResponse(INDUSTRY_ATOM, 200, "application/atom+xml");
    if (url === INDUSTRY_PAGE_URL) return textResponse(INDUSTRY_PAGE_HTML, 200, "text/html");
    throw new Error(`Unexpected fetch ${url}`);
  });
}

function evidenceOf(value: unknown): Array<{ id: string }> {
  if (
    !value ||
    typeof value !== "object" ||
    !("evidence" in value) ||
    !Array.isArray(value.evidence)
  ) {
    throw new Error("collect phase did not return evidence");
  }
  return value.evidence.map((item) => {
    if (!item || typeof item !== "object" || typeof (item as { id?: unknown }).id !== "string") {
      throw new Error("evidence item is missing id");
    }
    return { id: (item as { id: string }).id };
  });
}

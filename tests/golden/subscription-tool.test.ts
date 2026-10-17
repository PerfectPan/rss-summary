import { describe, it, vi } from "vite-plus/test";

import { RSS_SUMMARY_TOOL_ID } from "../../src/presentation/rivus-plugin.js";
import { PERSONAL_FEED_URL, PERSONAL_RSS } from "./fixtures.js";
import {
  errorRecord,
  executeTool,
  installFetch,
  matchSnapshot,
  readTree,
  registerPlugin,
  textResponse,
  useGoldenHarness,
} from "./harness.js";
import { nextUuid } from "./uuid-sequence.js";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: (() => nextUuid()) as typeof actual.randomUUID };
});

const harness = useGoldenHarness();
const occurrence = "2026-08-16T01:00:00.000Z";

describe("golden subscription tool", () => {
  it("runs collect, select, and render", async () => {
    installPersonalFeed();
    const context = harness.context();
    const { tools } = registerPlugin();
    const request = {
      occurrence,
      onlyNew: true,
      rssOnly: true,
      window: "previous-calendar-day",
    };
    const collected = await executeTool(tools, RSS_SUMMARY_TOOL_ID, {
      ...request,
      phase: "collect",
    });
    const evidence = evidenceOf(collected);
    const selection = evidence.map((item) => ({
      reason: item.summaryPolicy === "required" ? "文章写明了具体的工具链变化" : "普通动态不推送",
      ref: item.id,
      selected: item.summaryPolicy === "required",
    }));
    const selected = await executeTool(tools, RSS_SUMMARY_TOOL_ID, {
      ...request,
      phase: "select",
      selection,
    });
    const article = evidence.find((item) => item.summaryPolicy === "required");
    if (!article) throw new Error("collect did not return an article");
    const rendered = await executeTool(tools, RSS_SUMMARY_TOOL_ID, {
      ...request,
      draft: [{ ref: article.id, summary: "文章说明 TypeScript 工具链有具体的工作流变化。" }],
      phase: "render",
      research: [
        {
          content:
            "The TypeScript toolchain update documents a concrete workflow change for agents and explains the compiler flags.".repeat(
              2,
            ),
          ref: article.id,
          status: "ok",
          title: article.title,
          url: article.url,
        },
      ],
      selection,
    });
    await matchSnapshot(
      "subscription-phases.txt",
      { collected, rendered, selected, state: readTree(context.root) },
      [context.root],
    );
  });

  it("cancels a selected item when research fails", async () => {
    installPersonalFeed();
    const context = harness.context();
    const { tools } = registerPlugin();
    const request = {
      occurrence: "2026-08-16T02:00:00.000Z",
      onlyNew: true,
      rssOnly: true,
      window: "previous-calendar-day",
    };
    const collected = await executeTool(tools, RSS_SUMMARY_TOOL_ID, {
      ...request,
      phase: "collect",
    });
    const evidence = evidenceOf(collected);
    const selection = evidence.map((item) => ({
      reason: "文章写明了具体变化",
      ref: item.id,
      selected: item.summaryPolicy === "required",
    }));
    const article = evidence.find((item) => item.summaryPolicy === "required");
    if (!article) throw new Error("collect did not return an article");
    const rendered = await executeTool(tools, RSS_SUMMARY_TOOL_ID, {
      ...request,
      phase: "render",
      research: [
        {
          error: "browser: timeout; http: 403",
          ref: article.id,
          status: "failed",
          url: article.url,
        },
      ],
      selection,
    });
    await matchSnapshot(
      "subscription-research-failure.txt",
      { collected, rendered, state: readTree(context.root) },
      [context.root],
    );
  });

  it("throws SUBSCRIPTION_SUMMARY_VALIDATION_FAILED when the summary is invalid", async () => {
    installPersonalFeed();
    const context = harness.context();
    const { tools } = registerPlugin();
    const request = {
      occurrence: "2026-08-16T03:00:00.000Z",
      onlyNew: true,
      rssOnly: true,
      window: "previous-calendar-day",
    };
    const collected = await executeTool(tools, RSS_SUMMARY_TOOL_ID, {
      ...request,
      phase: "collect",
    });
    const evidence = evidenceOf(collected);
    const selection = evidence.map((item) => ({
      reason: "文章写明了具体变化",
      ref: item.id,
      selected: item.summaryPolicy === "required",
    }));
    const article = evidence.find((item) => item.summaryPolicy === "required");
    if (!article) throw new Error("collect did not return an article");
    let thrown: unknown;
    try {
      await executeTool(tools, RSS_SUMMARY_TOOL_ID, {
        ...request,
        draft: [{ ref: article.id, summary: "字".repeat(181) }],
        phase: "render",
        research: [
          {
            content:
              "The TypeScript toolchain update documents a concrete workflow change for agents and explains the compiler flags.".repeat(
                2,
              ),
            ref: article.id,
            status: "ok",
            url: article.url,
          },
        ],
        selection,
      });
    } catch (error) {
      thrown = error;
    }
    await matchSnapshot(
      "subscription-summary-validation.txt",
      { error: errorRecord(thrown), state: readTree(context.root) },
      [context.root],
    );
  });
});

function installPersonalFeed(): void {
  installFetch((url) => {
    if (url === PERSONAL_FEED_URL) return textResponse(PERSONAL_RSS);
    throw new Error(`Unexpected fetch ${url}`);
  });
}

function evidenceOf(
  value: unknown,
): Array<{ id: string; summaryPolicy: string; title: string; url: string }> {
  if (
    !value ||
    typeof value !== "object" ||
    !("evidence" in value) ||
    !Array.isArray(value.evidence)
  ) {
    throw new Error("collect phase did not return evidence");
  }
  return value.evidence.map((item) => {
    if (!item || typeof item !== "object") throw new Error("evidence item is invalid");
    const record = item as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.summaryPolicy !== "string" ||
      typeof record.title !== "string" ||
      typeof record.url !== "string"
    ) {
      throw new Error("evidence item is missing id, summaryPolicy, title, or url");
    }
    return {
      id: record.id,
      summaryPolicy: record.summaryPolicy,
      title: record.title,
      url: record.url,
    };
  });
}

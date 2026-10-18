import { join } from "node:path";

import { describe, expect, it, vi } from "vite-plus/test";

import { renderAutomationPresentation } from "../../../src/app/render/automation.js";
import { decodeViewFromMarkdown } from "../../../src/app/render/view-decode.js";
import {
  clearDeliveredViews,
  deliveredViews,
  renderDeliveredMarkdown,
} from "../../../src/app/render/view-store.js";
import type { ViewDocument } from "../../../src/app/render/view.js";
import { dailyAiView } from "../../../src/app/render/layouts/daily-ai.js";
import { digestView } from "../../../src/app/render/layouts/digest.js";
import { industryView } from "../../../src/app/render/layouts/industry.js";
import { newsView } from "../../../src/app/render/layouts/news.js";
import {
  DOUBAO_URL,
  GITHUB_REPOSITORY,
  GITHUB_WATCH_EVENT,
  grokStream,
  INDUSTRY_ATOM,
  INDUSTRY_FEED_URL,
  INDUSTRY_PAGE_HTML,
  INDUSTRY_PAGE_URL,
  PERSONAL_FEED_URL,
  PERSONAL_RSS,
  WINDOW_SINCE,
  WINDOW_UNTIL,
  doubaoPayload,
} from "../../golden/fixtures.js";
import {
  executeTool,
  installFetch,
  jsonResponse,
  registerPlugin,
  runCommand,
  textResponse,
  useGoldenHarness,
  writeGrokExecutable,
} from "../../golden/harness.js";
import { nextUuid } from "../../golden/uuid-sequence.js";
import { RSS_SUMMARY_DAILY_AI_TOOL_ID } from "../../../src/app/rivus/plugin.js";
import { RSS_SUMMARY_NEWS_TOOL_ID } from "../../../src/app/rivus/plugin.js";
import { RSS_SUMMARY_TOOL_ID } from "../../../src/app/rivus/plugin.js";
import { createRssAutomationPresentation } from "./automation-presentation.js";
import type { RssAutomationPresentationKind } from "../../../src/app/render/automation.js";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: (() => nextUuid()) as typeof actual.randomUUID };
});

const harness = useGoldenHarness();
const windowArgs = ["--since", WINDOW_SINCE, "--until", WINDOW_UNTIL, "--pages", "1"];

/**
 * Differential lock: for every (Markdown, View IR) pair the legacy parser's
 * presentation must deep-equal the View IR projection. `pairs` collects the
 * inputs so the report can state the covered input count.
 */
const pairs: Array<{
  kind: RssAutomationPresentationKind;
  markdown: string;
  label: string;
  view: ViewDocument;
}> = [];

function expectParity(
  label: string,
  kind: RssAutomationPresentationKind,
  markdown: string,
  view: ViewDocument,
): void {
  pairs.push({ kind, label, markdown, view });
  expect(renderAutomationPresentation(view, kind)).toEqual(
    createRssAutomationPresentation(markdown, kind),
  );
  // The fallback path (agent-altered text) must present identically too.
  expect(renderAutomationPresentation(decodeViewFromMarkdown(markdown), kind)).toEqual(
    createRssAutomationPresentation(markdown, kind),
  );
}

/** Compare every view the scenarios rendered since the last clear. */
function expectDeliveredParity(kind: RssAutomationPresentationKind): void {
  const entries = deliveredViews();
  expect(entries.length).toBeGreaterThan(0);
  for (const { markdown, view } of entries) {
    expectParity("delivered", kind, markdown, view);
  }
  clearDeliveredViews();
}

describe("golden-scenario presentation parity", () => {
  it("matches the subscriptions digest across event and rss-only windows", async () => {
    installDigestFetch();
    const context = harness.context();
    await runCommand(["digest", ...windowArgs], context);
    expectDeliveredParity("subscriptions");
    await runCommand(["digest", "--rss-only", ...windowArgs], context);
    expectDeliveredParity("subscriptions");
  });

  it("matches the second --only-new run and the dry-run", async () => {
    installDigestFetch();
    const context = harness.context();
    await runCommand(["digest", "--rss-only", "--only-new", ...windowArgs], context);
    clearDeliveredViews();
    await runCommand(["digest", "--rss-only", "--only-new", ...windowArgs], context);
    expectDeliveredParity("subscriptions");
    await runCommand(["digest", "--rss-only", "--only-new", "--dry-run", ...windowArgs], context);
    expectDeliveredParity("subscriptions");
  });

  it("matches the frontier brief", async () => {
    installIndustryFetch();
    const context = harness.context();
    await runCommand(
      ["industry", "--since", WINDOW_SINCE, "--until", WINDOW_UNTIL, "--only-new"],
      context,
    );
    expectDeliveredParity("industry");
  });

  it("matches a Doubao noon and an exhausted-budget news brief", async () => {
    harness.context();
    process.env.NEWS_SEARCH_MODE = "doubao";
    process.env.DOUBAO_SEARCH_API_KEY = "golden-key";
    installFetch((url) => {
      if (url === DOUBAO_URL)
        return jsonResponse(JSON.parse(doubaoPayload("2026-08-16T02:00:00.000Z")));
      throw new Error(`Unexpected fetch ${url}`);
    });
    const { tools } = registerPlugin();
    await executeTool(tools, RSS_SUMMARY_NEWS_TOOL_ID, {
      edition: "noon",
      occurrence: "2026-08-16T04:00:00.000Z",
    });
    expectDeliveredParity("news");

    process.env.NEWS_SEARCH_DAILY_LIMIT = "0";
    await executeTool(tools, RSS_SUMMARY_NEWS_TOOL_ID, {
      edition: "noon",
      occurrence: "2026-08-16T04:00:00.000Z",
    });
    expectDeliveredParity("news");
  });

  it("matches a Grok news brief with degradation notes", async () => {
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
    await executeTool(tools, RSS_SUMMARY_NEWS_TOOL_ID, {
      edition: "noon",
      occurrence: "2026-08-16T04:00:00.000Z",
    });
    expectDeliveredParity("news");
  });

  it("matches the three-phase subscription render", async () => {
    installFetch((url) => {
      if (url === PERSONAL_FEED_URL) return textResponse(PERSONAL_RSS);
      throw new Error(`Unexpected fetch ${url}`);
    });
    const { tools } = registerPlugin();
    const request = {
      occurrence: "2026-08-16T01:00:00.000Z",
      onlyNew: true,
      rssOnly: true,
      window: "previous-calendar-day",
    };
    const collected = (await executeTool(tools, RSS_SUMMARY_TOOL_ID, {
      ...request,
      phase: "collect",
    })) as { evidence: Array<{ id: string; summaryPolicy: string }> };
    const selection = collected.evidence.map((item) => ({
      reason: item.summaryPolicy === "required" ? "文章写明了具体的工具链变化" : "普通动态不推送",
      ref: item.id,
      selected: item.summaryPolicy === "required",
    }));
    const article = collected.evidence.find((item) => item.summaryPolicy === "required");
    if (!article) throw new Error("collect did not return an article");
    await executeTool(tools, RSS_SUMMARY_TOOL_ID, {
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
          title: "TypeScript toolchain update",
          url: "https://example.com/deno-2-4",
        },
      ],
      selection,
    });
    expectDeliveredParity("subscriptions");
  });

  it("matches the daily-ai render with a Grok-relayed X source", async () => {
    const context = harness.context();
    process.env.DAILY_AI_X_HANDLES = "ClaudeDevs";
    process.env.X_ACCOUNT_POSTS_PER_FETCH = "1";
    process.env.NEWS_SEARCH_MODE = "grok";
    await writeGrokExecutable(
      join(context.root, "grok"),
      grokStream({
        author: "@ClaudeDevs",
        publishedAt: "2026-08-15T12:00:00.000Z",
        summary: "Claude 更新了 TypeScript 工具链的具体工作流。",
        title: "Claude 更新了 TypeScript 工具链",
      }),
    );
    installFetch((url) => {
      if (url === INDUSTRY_FEED_URL)
        return textResponse(INDUSTRY_ATOM, 200, "application/atom+xml");
      if (url === INDUSTRY_PAGE_URL) return textResponse(INDUSTRY_PAGE_HTML, 200, "text/html");
      throw new Error(`Unexpected fetch ${url}`);
    });
    const { tools } = registerPlugin();
    const occurrence = "2026-08-16T04:00:00.000Z";
    const collected = (await executeTool(tools, RSS_SUMMARY_DAILY_AI_TOOL_ID, {
      occurrence,
      phase: "collect",
    })) as { evidence: Array<{ id: string }> };
    const first = collected.evidence[0];
    if (!first) throw new Error("collect did not return evidence");
    await executeTool(tools, RSS_SUMMARY_DAILY_AI_TOOL_ID, {
      draft: [
        { category: "模型发布", headline: "Claude 更新了 TypeScript 工具链", refs: [first.id] },
      ],
      occurrence,
      phase: "render",
    });
    expectDeliveredParity("daily-ai");
  });
});

describe("layout-document presentation parity", () => {
  it("matches digest documents with links, pending papers, and empty windows", () => {
    const rich = digestView({
      generatedAt: "2026-08-16T04:00:00.000Z",
      username: "PerfectPan",
      windowLabel: "2026-08-15 +08:00",
      candidates: [
        {
          repo: "example/project",
          source: "github",
          category: "discovery",
          score: 90,
          actors: ["alice"],
          eventTypes: ["watch"],
          reasons: [],
          matchedInterests: ["agent"],
          events: [],
          label: "Strong update",
          url: "https://github.com/example/project",
          description: "What changed and why it matters.",
        },
        {
          repo: "rss:https://example.com/routine",
          source: "rss",
          category: "release",
          score: 30,
          actors: ["Official"],
          eventTypes: ["release"],
          reasons: [],
          events: [],
          label: "Routine update",
          url: "https://example.com/routine",
        },
        paperCandidate(),
      ],
    });
    expectParity("digest rich", "subscriptions", renderDeliveredMarkdown(rich), rich);

    const empty = digestView({
      generatedAt: "2026-08-16T04:00:00.000Z",
      username: "PerfectPan",
      windowLabel: "2026-08-15 +08:00",
      candidates: [],
    });
    expectParity("digest empty", "subscriptions", renderDeliveredMarkdown(empty), empty);

    const papersOnly = digestView({
      generatedAt: "2026-08-16T04:00:00.000Z",
      username: "PerfectPan",
      sourceMode: "rss",
      candidates: [paperCandidate()],
    });
    expectParity(
      "digest papers only",
      "subscriptions",
      renderDeliveredMarkdown(papersOnly),
      papersOnly,
    );
  });

  it("matches frontier documents including the empty notice", () => {
    const rich = industryView({
      generatedAt: "2026-08-09T01:00:00.000Z",
      windowLabel: "2026-08-09 +08:00",
      candidates: [
        {
          repo: "rss:https://example.com/a",
          source: "rss",
          category: "article",
          score: 50,
          actors: ["OpenAI"],
          eventTypes: ["article"],
          reasons: ["matches interest: agent"],
          matchedInterests: ["agent"],
          events: [],
          label: "New agent release",
          url: "https://example.com/a",
          description: "An agent framework release.",
        },
        paperCandidate(),
      ],
    });
    expectParity("frontier rich", "industry", renderDeliveredMarkdown(rich), rich);

    const empty = industryView({ generatedAt: "2026-08-09T01:00:00.000Z", candidates: [] });
    expectParity("frontier empty", "industry", renderDeliveredMarkdown(empty), empty);
  });

  it("matches news documents with recovery notes and empty states", () => {
    const stories = [
      {
        id: "s1",
        title: "Headline",
        canonicalUrl: "https://example.com/a",
        summary: "Body sentence one.",
        siteName: "Example",
        publishTime: "2026-07-29T09:00:00+08:00",
        rankScore: 1,
        authInfoLevel: 2,
        topicIds: ["technology"],
        topicLabels: ["科技新闻"],
        queryIds: ["ai-release"],
        queries: ["AI"],
        queryHits: 1,
        scoreBreakdown: { rank: 16, authority: 8, freshness: 6, crossQuery: 0 },
        score: 100,
        selectedTopicId: "technology",
      },
    ];
    const topics = [
      {
        id: "technology",
        label: "科技新闻",
        icon: "💻",
        enabled: true,
        sourcePolicy: "authoritative" as const,
        maxItems: 3,
        queries: [
          {
            id: "ai-release",
            text: "AI",
            intent: "model-release" as const,
            subjectAny: ["AI"],
            eventAny: ["发布"],
            excludedAny: [],
          },
        ],
      },
    ];
    const base = {
      day: "2026-07-29",
      edition: "noon" as const,
      generatedAt: "2026-07-29T04:30:00.000Z",
      stories,
      topics,
      warnings: [],
      windowLabel: "00:00–12:30",
    };
    const withNotes = newsView({
      ...base,
      stories: [],
      sourceStatus: {
        state: "recovered" as const,
        queries: 2,
        completed: 1,
        recovered: 1,
        incompleteTopics: [],
        notes: ["备用来源已完成"],
      },
    });
    expectParity("news recovered notes", "news", renderDeliveredMarkdown(withNotes), withNotes);

    const partial = newsView({
      ...base,
      stories: [],
      sourceStatus: {
        state: "partial" as const,
        queries: 2,
        completed: 1,
        recovered: 0,
        incompleteTopics: ["安全"],
        notes: [],
      },
    });
    expectParity("news partial empty", "news", renderDeliveredMarkdown(partial), partial);
  });

  it("matches daily-ai documents across categories, badges, and warnings", () => {
    const evidence = [
      {
        id: "s1",
        title: "Codex 2.0",
        url: "https://openai.com/news/codex-2",
        publishedAt: "2026-08-10T03:00:00Z",
        excerpt: "release",
        tier: "official" as const,
        sourceName: "OpenAI",
        topicId: "developer-tools",
      },
      {
        id: "x:123",
        title: "开发经验",
        url: "https://x.com/claudedevs/status/123",
        publishedAt: "2026-08-10T01:00:00Z",
        excerpt: "作者的经验",
        tier: "unverified" as const,
        sourceName: "@claudedevs · X（Grok 整理）",
      },
    ];
    const rich = dailyAiView({
      day: "2026-08-10",
      windowLabel: "2026-08-09 09:00–2026-08-10 09:00 +08:00",
      items: [
        { category: "概览/要闻", headline: "第一条要闻", refs: ["s1"] },
        { category: "开发生态", headline: "OpenAI 发布 Codex 2.0", refs: ["s1"] },
        { category: "开发生态", headline: "ClaudeDevs 分享开发经验", refs: ["x:123", "s1"] },
      ],
      evidence,
      warnings: [],
    });
    expectParity("daily-ai rich", "daily-ai", renderDeliveredMarkdown(rich), rich);

    const empty = dailyAiView({
      day: "2026-08-10",
      windowLabel: "2026-08-09 09:00–2026-08-10 09:00 +08:00",
      items: [],
      evidence: [],
      warnings: ["Doubao 搜索暂不可用：本期仅使用官方来源"],
    });
    expectParity("daily-ai empty + warnings", "daily-ai", renderDeliveredMarkdown(empty), empty);
  });

  it("matches the registration snapshot's fixed Markdown from a hand-built view", () => {
    const fixedMarkdown = `# 固定标题

一条固定说明

## 模型发布

1. 新模型上线 [↗ #1](https://example.com/item)
`;
    const view: ViewDocument = {
      title: "固定标题",
      meta: ["一条固定说明"],
      sections: [
        {
          heading: "模型发布",
          style: "atx",
          items: [
            {
              shape: "numbered",
              number: 1,
              headline: "新模型上线",
              links: [{ text: "↗ #1", url: "https://example.com/item" }],
              notes: [],
            },
          ],
        },
      ],
      trailing: [],
      variant: "brief",
    };
    for (const kind of ["subscriptions", "daily-ai", "news", "industry", "generic"] as const) {
      expect(renderAutomationPresentation(view, kind)).toEqual(
        createRssAutomationPresentation(fixedMarkdown, kind),
      );
    }
    pairs.push({ kind: "generic", label: "registration fixed", markdown: fixedMarkdown, view });
  });
});

function paperCandidate() {
  return {
    repo: "rss:https://arxiv.org/abs/2608.01234",
    source: "rss" as const,
    category: "paper" as const,
    score: 55,
    actors: ["arXiv cs.AI"],
    eventTypes: ["paper" as const],
    reasons: ["matches paper abstract: agent"],
    events: [],
    label: "Unverified agent claim",
    url: "https://arxiv.org/abs/2608.01234",
  };
}

describe("agent-text fallback parity", () => {
  // Markdown an Agent could plausibly return after altering the Tool output.
  const samples: Array<[string, string]> = [
    [
      "no heading falls back to the generic title",
      "一条没有标题的说明\n\n- 列表项 [来源 ↗](https://example.com/a)",
    ],
    [
      "capped meta routes the seventh preamble line to the footnote",
      "# 标题\n\n一\n二\n三\n四\n五\n六\n七\n八\n\n- 条目 [↗](https://example.com/x)",
    ],
    [
      "an empty section keeps later section ids on their original index",
      "# 标题\n\n说明\n\n## 空节\n\n## 模型发布\n\n1. 条目 [↗ #1](https://example.com/item)",
    ],
    [
      "an emphasized link inside a list item keeps its own note lines",
      "# 午间热点 · 2026-08-14\n\n1 条重要动态 · 00:00–12:30\n\n## 重大资本事件\n\n- **[Databricks 融资](https://example.test/databricks)**\n  时间：2026 年 08 月 14 日 04:41 · 来源：示例财经",
    ],
    [
      "a mid-document status line resets the active item",
      "# 标题\n\n说明\n\n1. 条目 [↗ #1](https://example.com/item)\n注解行\n数据源状态：中断\n游离行",
    ],
    [
      "source relabeling applies to the last source of the active item",
      "# 我的订阅 · 2026-08-13\n\n2 条更新 · GitHub Home\n\n**重点摘要**\n\n**[owner/repo](https://github.com/owner/repo)**\n项目说明。\n来源：GitHub Home",
    ],
    [
      "duplicate inline sources collapse by label",
      "# Daily AI Digest · 2026-08-13\n\n23 条可信动态 · 来源可追溯\n\n## 模型发布\n\n1. Codex CLI 发布新版本 [↗ #2](https://github.com/openai/codex/releases/tag/v1) [↗ #3](https://github.com/openai/codex/commit/abc) [↗ #4 · X（Grok 整理）](https://x.com/openai/status/1)",
    ],
    [
      "long values are bounded like the legacy parser",
      `# ${"长标题".repeat(80)}\n\n${"长说明".repeat(60)}\n\n- ${"长条目".repeat(120)} [↗ #9](https://sub.domain.example.com/path)`,
    ],
    [
      "windows line endings and stray lines degrade gracefully",
      "# 标题\r\n\r\n说明\r\n\r\n游离脚注行\r\n",
    ],
  ];

  it.each(samples)("decodes %s to an identical presentation", (_name, markdown) => {
    expect(renderAutomationPresentation(decodeViewFromMarkdown(markdown), "generic")).toEqual(
      createRssAutomationPresentation(markdown, "generic"),
    );
  });

  it("covers at least 20 (markdown, view) input groups", () => {
    expect(pairs.length).toBeGreaterThanOrEqual(20);
  });
});

function installDigestFetch(): void {
  installFetch((url) => {
    if (url === PERSONAL_FEED_URL) return textResponse(PERSONAL_RSS);
    if (url.includes("/received_events")) {
      const page = new URL(url).searchParams.get("page");
      return jsonResponse(page === "1" ? [GITHUB_WATCH_EVENT] : []);
    }
    if (url === "https://api.github.com/repos/example/project")
      return jsonResponse(GITHUB_REPOSITORY);
    if (url.includes("/user/following")) return jsonResponse([]);
    throw new Error(`Unexpected fetch ${url}`);
  });
}

function installIndustryFetch(): void {
  installFetch((url) => {
    if (url === INDUSTRY_FEED_URL) return textResponse(INDUSTRY_ATOM, 200, "application/atom+xml");
    if (url === INDUSTRY_PAGE_URL) return textResponse(INDUSTRY_PAGE_HTML, 200, "text/html");
    throw new Error(`Unexpected fetch ${url}`);
  });
}

import { describe, expect, it } from "vite-plus/test";

import {
  buildSignalRepos,
  buildSignalUpdates,
  selectSignalItems,
  type SignalDomainRules,
  type SignalFrontendBias,
  type SignalRepoHit,
  type SignalScoring,
  type SignalUpdateHit,
} from "../../src/domain/signal.js";
import { renderSignalBrief } from "../../src/presentation/signal-render.js";

const window = {
  day: "2026-07-29",
  since: Date.parse("2026-07-29T00:00:00+08:00"),
  until: Date.parse("2026-07-30T00:00:00+08:00"),
  timezoneOffset: "+08:00",
};

const frontendBias: SignalFrontendBias = {
  languages: ["TypeScript", "JavaScript"],
  repoTopics: ["react", "nextjs", "mcp", "agent", "ai"],
  updateKeywords: ["coding", "agent", "IDE", "SDK", "browser", "TypeScript"],
  modelTitleHints: ["GPT", "Claude", "Gemini", "LLM", "API", "模型"],
};

const scoring: SignalScoring = {
  officialDomainBoost: 30,
  hnPointsMaxScore: 30,
  frontendKeywordBoost: 8,
  frontendKeywordMaxHits: 3,
  recencyMaxScore: 10,
  crossSourceBoost: 15,
  repoStarMaxScore: 30,
  repoNewnessWeight: 2,
  repoLanguageBoost: 10,
  repoTopicBoost: 5,
  repoTopicMaxHits: 3,
  repoMissingDescriptionPenalty: 10,
  repoMissingLanguagePenalty: 5,
};

function rules(overrides: Partial<SignalDomainRules> = {}): SignalDomainRules {
  return {
    window,
    scoring,
    frontendBias,
    officialDomains: ["openai.com", "anthropic.com"],
    excludeNamePatterns: [/^awesome[-_]/u],
    createdWithinDays: 7,
    ...overrides,
  };
}

function updateHit(overrides: Partial<SignalUpdateHit>): SignalUpdateHit {
  return {
    id: "hit-1",
    title: "Agent coding SDK shipped",
    url: "https://openai.com/blog/agent-sdk",
    summary: "A developer SDK for agent workflows.",
    publishedAt: "2026-07-29T09:00:00+08:00",
    sourceLabel: "Example",
    kind: "product",
    source: "official",
    ...overrides,
  };
}

function repoHit(overrides: Partial<SignalRepoHit>): SignalRepoHit {
  return {
    id: "acme/agent-kit",
    title: "acme/agent-kit",
    url: "https://github.com/acme/agent-kit",
    description: "A TypeScript agent harness with MCP support.",
    language: "TypeScript",
    stars: 500,
    createdAt: "2026-07-27T10:00:00+08:00",
    topics: ["agent", "mcp"],
    sourceLabel: "GitHub",
    ...overrides,
  };
}

describe("signal render", () => {
  it("omits empty sections and renders kind labels plus repo metrics", () => {
    const updates = buildSignalUpdates(
      [
        updateHit({
          id: "m",
          title: "GPT-5 API",
          kind: "model",
          sourceLabel: "OpenAI",
          url: "https://openai.com/blog/gpt-5",
        }),
        updateHit({
          id: "p",
          title: "Agent IDE",
          kind: "product",
          sourceLabel: "Hacker News",
          source: "hn",
          points: 210,
          url: "https://example.com/agent-sdk",
        }),
      ],
      rules(),
    );
    const repos = buildSignalRepos(
      [
        repoHit({
          id: "acme/agent-kit",
          title: "acme/agent-kit",
          stars: 1234,
          language: "TypeScript",
        }),
      ],
      rules(),
    );
    const selected = selectSignalItems(updates, repos, { maxTotal: 8, updates: 5, opensource: 4 });

    const markdown = renderSignalBrief({
      day: "2026-07-29",
      updates: selected.updates,
      opensource: selected.opensource,
      warnings: [],
      timezoneOffset: "+08:00",
    });

    expect(markdown).toContain("# 高信号速览 · 2026-07-29");
    expect(markdown).toContain("**动态 · 2**");
    expect(markdown).toContain("**[模型] [GPT-5 API](https://openai.com/blog/gpt-5)**");
    expect(markdown).toContain("**[产品] [Agent IDE](https://example.com/agent-sdk)**");
    expect(markdown).toContain("**开源 · 1**");
    expect(markdown).toContain("**[上升] [acme/agent-kit](https://github.com/acme/agent-kit)**");
    expect(markdown).toMatch(/1\.2k★/u);
    expect(markdown).toContain("TypeScript");
  });

  it("omits a section entirely when it has no items", () => {
    const markdown = renderSignalBrief({
      day: "2026-07-29",
      updates: [],
      opensource: [],
      warnings: ["Hacker News 暂不可用"],
      timezoneOffset: "+08:00",
    });

    expect(markdown).not.toContain("**动态");
    expect(markdown).not.toContain("**开源");
    expect(markdown).not.toContain("暂无");
    expect(markdown).toContain("数据源状态：Hacker News 暂不可用");
  });
});

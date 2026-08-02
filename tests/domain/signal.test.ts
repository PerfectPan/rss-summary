import { describe, expect, it } from "vitest";

import {
  buildSignalRepos,
  buildSignalUpdates,
  classifyUpdateKind,
  selectSignalItems,
  type SignalDomainRules,
  type SignalRepoHit,
  type SignalUpdateHit,
} from "../../src/domain/signal.js";
import type { SignalFrontendBias, SignalQuotas, SignalScoring } from "../../src/domain/signal.js";

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

describe("signal domain", () => {
  it("ranks official-domain updates above ordinary sources", () => {
    const items = buildSignalUpdates(
      [
        updateHit({ id: "official", title: "GPT-5 API announcement", url: "https://openai.com/blog/model", sourceLabel: "OpenAI" }),
        updateHit({
          id: "blog",
          title: "Third-party review of the coding agent SDK",
          url: "https://example.com/blog/model",
          sourceLabel: "Hacker News",
          source: "hn",
          points: 80,
        }),
      ],
      rules(),
    );

    expect(items.map(({ id }) => id)).toEqual(["official", "blog"]);
    expect(items[0]!.score).toBeGreaterThan(items[1]!.score);
    expect(items[0]!.reasons).toContain("官方来源");
  });

  it("rewards Hacker News points with diminishing returns", () => {
    const low = buildSignalUpdates([updateHit({ source: "hn", points: 100 })], rules())[0]!;
    const high = buildSignalUpdates([updateHit({ source: "hn", points: 900 })], rules())[0]!;
    const higher = buildSignalUpdates([updateHit({ source: "hn", points: 4900 })], rules())[0]!;

    expect(high.score).toBeGreaterThan(low.score);
    expect(higher.score - high.score).toBeLessThan(high.score - low.score);
    expect(low.reasons).toContain("HN 100 分");
  });

  it("scores fresher same-day updates higher on recency (时效)", () => {
    const early = buildSignalUpdates(
      [
        updateHit({
          id: "early",
          url: "https://openai.com/blog/early",
          publishedAt: "2026-07-29T01:00:00+08:00",
        }),
      ],
      rules(),
    )[0]!;
    const late = buildSignalUpdates(
      [
        updateHit({
          id: "late",
          url: "https://openai.com/blog/late",
          publishedAt: "2026-07-29T22:00:00+08:00",
        }),
      ],
      rules(),
    )[0]!;

    expect(late.score).toBeGreaterThan(early.score);
    expect(late.reasons).toContain("时效");
    expect(early.reasons).toContain("时效");
  });

  it("boosts items confirmed by both official search and Hacker News", () => {
    const single = buildSignalUpdates(
      [updateHit({ id: "one", source: "official", url: "https://openai.com/x" })],
      rules(),
    )[0]!;
    const dual = buildSignalUpdates(
      [
        updateHit({ id: "one", source: "official", url: "https://openai.com/x", kind: "model", title: "GPT-5 API" }),
        updateHit({
          id: "two",
          source: "hn",
          points: 300,
          url: "https://openai.com/x?utm_source=hn",
          kind: "product",
          title: "Show HN: GPT-5",
          sourceLabel: "Hacker News",
        }),
      ],
      rules(),
    )[0]!;

    expect(dual.score).toBeGreaterThan(single.score);
    expect(dual.reasons).toContain("双源命中");
    expect(dual.url).toBe("https://openai.com/x");
    // Official content wins for kind/label; HN points still contribute to score.
    expect(dual.kind).toBe("model");
    expect(dual.sourceLabel).toBe("Example");
    expect(dual.title).toBe("GPT-5 API");
    expect(dual.metrics?.points).toBe(300);
  });

  it("rejects official-source hits outside the configured domain allowlist", () => {
    const items = buildSignalUpdates(
      [
        updateHit({ id: "ok", title: "OpenAI ships agent SDK", url: "https://openai.com/blog/ok", source: "official" }),
        updateHit({ id: "off", title: "Random blog post", url: "https://random-blog.example/x", source: "official" }),
        updateHit({
          id: "hn",
          title: "Show HN: Agent harness",
          url: "https://random-blog.example/y",
          source: "hn",
          points: 120,
        }),
      ],
      rules(),
    );
    expect(items.map(({ id }) => id).sort()).toEqual(["hn", "ok"]);
  });

  it("rejects Hacker News hits that lack AI×dev relevance keywords", () => {
    const items = buildSignalUpdates(
      [
        updateHit({
          id: "noise",
          title: "How Google helped destroy adoption of RSS feeds",
          url: "https://example.com/rss-history",
          source: "hn",
          points: 400,
          summary: "A historical essay about syndication.",
        }),
        updateHit({
          id: "author-false-positive",
          title: "The Silicon Valley Founder Meat Grinder",
          url: "https://example.com/meat",
          source: "hn",
          points: 300,
          // Synthetic HN summary embeds the author; "Kaizeras" must not match "AI".
          summary: "Kaizeras 分享 · 148 条评论",
        }),
        updateHit({
          id: "relevant",
          title: "Show HN: Agent IDE for TypeScript",
          url: "https://example.com/agent-ide",
          source: "hn",
          points: 120,
          summary: "A coding agent harness.",
        }),
        updateHit({
          id: "ai-word",
          title: "AI financial advice is surprisingly good",
          url: "https://example.com/ai-finance",
          source: "hn",
          points: 200,
        }),
        updateHit({
          id: "official-ok",
          title: "Vendor ships unrelated appliance",
          url: "https://openai.com/blog/appliance",
          source: "official",
          summary: "Hardware note without coding keywords.",
        }),
      ],
      rules({
        frontendBias: {
          ...frontendBias,
          // No bare "AI"/"model" — generic media titles must not enter the updates section.
          updateKeywords: ["agent", "IDE", "TypeScript", "coding", "SDK", "LLM"],
        },
      }),
    );

    expect(items.map(({ id }) => id).sort()).toEqual(["official-ok", "relevant"]);
  });

  it("deduplicates canonical URLs and collapses the same event across publishers", () => {
    const items = buildSignalUpdates(
      [
        updateHit({ id: "a", url: "https://example.com/x?utm_source=one", title: "Claude 3.7 发布重大更新", source: "hn", points: 100 }),
        updateHit({ id: "b", url: "https://example.com/x?ref=two", title: "Claude 3.7 发布重大更新", source: "hn", points: 90 }),
        updateHit({ id: "c", url: "https://other.example.net/y", title: "Claude 3.7 重大更新发布详情", source: "hn", points: 80 }),
        updateHit({ id: "d", url: "https://example.com/z", title: "Agent coding SDK 完全不同的另一件事", source: "hn", points: 70 }),
      ],
      rules(),
    );

    // "d" has more updateKeywords hits so ranks above the Claude-only title after relevance filter.
    expect(items.map(({ id }) => id)).toEqual(["d", "a"]);
  });

  it("excludes awesome lists and missing-description repos, and biases toward TypeScript topics", () => {
    const items = buildSignalRepos(
      [
        repoHit({ id: "acme/awesome-agents", title: "acme/awesome-agents", stars: 9000 }),
        repoHit({ id: "acme/rust-ai", title: "acme/rust-ai", language: "Rust", topics: [], stars: 9000 }),
        repoHit({
          id: "acme/agent-kit",
          title: "acme/agent-kit",
          language: "TypeScript",
          topics: ["agent", "mcp"],
          stars: 300,
        }),
      ],
      rules(),
    );

    expect(items.map(({ id }) => id)).not.toContain("acme/awesome-agents");
    expect(items[0]?.id).toBe("acme/agent-kit");
    expect(items[0]?.reasons).toContain("语言 TypeScript");
    expect(items[0]?.reasons).toContain("话题 mcp/agent");
  });

  it("deduplicates repositories by lowercased owner/repo identity", () => {
    const items = buildSignalRepos(
      [
        repoHit({ id: "Acme/Agent-Kit", title: "Acme/Agent-Kit", stars: 100 }),
        repoHit({ id: "acme/agent-kit", title: "acme/agent-kit", stars: 900 }),
      ],
      rules(),
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.metrics?.stars).toBe(900);
  });

  it("rejects updates outside the calendar day and repos outside the created window", () => {
    const updates = buildSignalUpdates(
      [
        updateHit({ id: "stale", publishedAt: "2026-07-28T23:59:59+08:00", url: "https://openai.com/stale" }),
        updateHit({ id: "future", publishedAt: "2026-07-30T00:00:01+08:00", url: "https://openai.com/future" }),
        updateHit({ id: "today", publishedAt: "2026-07-29T18:00:00+08:00", url: "https://openai.com/today" }),
      ],
      rules(),
    );
    expect(updates.map(({ id }) => id)).toEqual(["today"]);

    const repos = buildSignalRepos(
      [
        repoHit({ id: "acme/old", title: "acme/old", createdAt: "2026-07-21T00:00:00+08:00" }),
        repoHit({ id: "acme/new", title: "acme/new", createdAt: "2026-07-28T00:00:00+08:00" }),
      ],
      rules(),
    );
    expect(repos.map(({ id }) => id)).toEqual(["acme/new"]);
  });

  it("soft-balances model and product kinds inside the updates quota", () => {
    const hits: SignalUpdateHit[] = [
      ...Array.from({ length: 5 }, (_, index) =>
        updateHit({
          id: `model-${index}`,
          title: `GPT-${index} coding model`,
          kind: "model",
          url: `https://openai.com/blog/gpt-${index}`,
        }),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        updateHit({
          id: `product-${index}`,
          title: `Product ${index} for developers`,
          kind: "product",
          url: `https://openai.com/product-${index}`,
        }),
      ),
    ];
    const built = buildSignalUpdates(hits, rules());
    const quotas: SignalQuotas = { maxTotal: 8, updates: 5, opensource: 4 };

    const selected = selectSignalItems(built, [], quotas).updates;

    expect(selected).toHaveLength(5);
    const modelCount = selected.filter(({ kind }) => kind === "model").length;
    const productCount = selected.filter(({ kind }) => kind === "product").length;
    expect(modelCount).toBe(3);
    expect(productCount).toBe(2);
    expect(Math.abs(modelCount - productCount)).toBeLessThanOrEqual(1);
    // Display order is score-desc after soft-balance selection (not interleave order).
    for (let index = 1; index < selected.length; index += 1) {
      expect(selected[index - 1]!.score).toBeGreaterThanOrEqual(selected[index]!.score);
    }
  });

  it("caps both sections and enforces the global total quota", () => {
    const updates = buildSignalUpdates(
      Array.from({ length: 7 }, (_, index) =>
        updateHit({
          id: `u-${index}`,
          title: `Agent coding SDK update ${index}`,
          url: `https://example.com/u-${index}`,
          source: "hn",
          points: 100,
        }),
      ),
      rules(),
    );
    const repos = buildSignalRepos(
      Array.from({ length: 6 }, (_, index) =>
        repoHit({ id: `acme/r-${index}`, title: `acme/r-${index}`, url: `https://github.com/acme/r-${index}` }),
      ),
      rules(),
    );
    const quotas: SignalQuotas = { maxTotal: 8, updates: 5, opensource: 4 };

    const selected = selectSignalItems(updates, repos, quotas);

    expect(selected.updates.length + selected.opensource.length).toBe(8);
    expect(selected.updates.length).toBeLessThanOrEqual(5);
    expect(selected.opensource.length).toBeLessThanOrEqual(4);
  });

  it("preserves soft model/product balance when maxTotal forces a section shrink", () => {
    const hits: SignalUpdateHit[] = [
      ...Array.from({ length: 5 }, (_, index) =>
        updateHit({
          id: `model-${index}`,
          title: `GPT-${index} coding model`,
          kind: "model",
          url: `https://openai.com/blog/gpt-${index}`,
        }),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        updateHit({
          id: `product-${index}`,
          title: `Product ${index} for developers`,
          kind: "product",
          url: `https://openai.com/product-${index}`,
        }),
      ),
    ];
    const updates = buildSignalUpdates(hits, rules());
    const repos = buildSignalRepos(
      Array.from({ length: 4 }, (_, index) =>
        repoHit({ id: `acme/r-${index}`, title: `acme/r-${index}`, url: `https://github.com/acme/r-${index}` }),
      ),
      rules(),
    );
    // 5 + 4 > 8 → budgets shrink while soft balance still applies inside updates.
    const selected = selectSignalItems(updates, repos, { maxTotal: 8, updates: 5, opensource: 4 });

    expect(selected.updates.length + selected.opensource.length).toBe(8);
    const modelCount = selected.updates.filter(({ kind }) => kind === "model").length;
    const productCount = selected.updates.filter(({ kind }) => kind === "product").length;
    expect(modelCount).toBeGreaterThan(0);
    expect(productCount).toBeGreaterThan(0);
    expect(Math.abs(modelCount - productCount)).toBeLessThanOrEqual(1);
  });

  it("classifies model titles through config hints", () => {
    expect(classifyUpdateKind("Anthropic releases Claude Sonnet", frontendBias.modelTitleHints)).toBe("model");
    expect(classifyUpdateKind("Vercel ships new SDK", frontendBias.modelTitleHints)).toBe("product");
    expect(classifyUpdateKind("OpenAI 发布新模型", frontendBias.modelTitleHints)).toBe("model");
  });
});

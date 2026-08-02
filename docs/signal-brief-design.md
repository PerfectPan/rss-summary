# Signal Brief Design

Status: approved  
Date: 2026-08-01  
Audience: frontend engineer who also tracks AI

> Implemented on `codex/signal-brief` (PR #14). Implementation notes vs. this doc: official-search intents are objects `{ kind, query }` so the `模型`/`产品` label is config-driven; GitHub Search uses free-text keyword `OR` (qualifier `OR` and parenthesized groups are rejected by the Search API); the CLI dry-run is `rss-summary signal --day YYYY-MM-DD`.

## Question

How should this repository add a high-signal daily brief for “what shipped / rose today” without mixing it into personal RSS subscriptions, and without turning noon/evening web-news into another low-quality search dump?

## Product Shape

### Name And Question

- Product name: **高信号速览** (Signal Brief)
- Questions it answers:
  - 动态：昨天/今天有没有值得关注的模型或产品/工具变化？
  - 开源：有没有值得 star / 试用的上升仓库（或重要 OSS 版本）？

### Two Sections (Not Three, Not Fully Flattened)

| Section | Chinese | Contains | Item labels |
| --- | --- | --- | --- |
| Updates | 动态 | Model launches/API capability changes, developer products/tools | `模型` / `产品` |
| Open source | 开源 | Rising repos, optionally important OSS releases | `上升` / `版本` |

Rationale:

- Model vs product are the same *decision class* for a frontend builder (“should I change tools/models/workflow?”) and share news-like result shapes.
- Open source is a different *decision class* and different metrics (stars, created date, language).
- Three empty columns fragment the card on quiet days; one flat list mixes incomparable signals.

Empty section rule: **omit the whole section**. Do not print “暂无”.

### Reader Bias (Frontend × AI)

Keep the same taxonomy used by technical AI digests (models · products/tools · repos), but weight for a frontend engineer:

| Kind | Prefer | Deprioritize |
| --- | --- | --- |
| Model | Coding models, API/productized capability, multimodal/UI, browser/computer-use, price/latency changes | Pure pretrain writeups with no developer surface |
| Product | IDE/agents, SDKs embeddable in web apps, design-to-code, frontend-relevant DX | Pure to-C chat shells, marketing landing pages |
| Repo | TypeScript/JavaScript, React/Next-related, MCP/agent harnesses, usable README demos | `awesome-*` lists, empty scaffolds, pure training-script dumps |
| Paper | Out of v1 by default | Research-only unless it ships as a product or repo |

### Cadence

- **Once per day** (default evening local time). Do not duplicate as noon + evening unless experience later demands it.
- Morning digest, noon/evening news, and signal brief remain three separate products.

### Hard Non-Goals (v1)

- Do not read `feeds.json` or call `RssClient`.
- Do not change morning digest ranking as part of this feature.
- Do not use an LLM for discovery or ranking.
- Do not scrape GitHub Trending HTML as the primary open-source source.
- Do not merge signal items into the noon/evening news Tool output.

## Separation From Existing Pipelines

```text
Morning digest   → GitHub Home + feeds.json     (personalized timeline)
Noon / evening   → Doubao + news-topics.json    (general authoritative news)
Signal brief     → GH Search + HN + official search  (public high-signal)
```

| Concern | Morning | Noon/evening | Signal |
| --- | --- | --- | --- |
| Config | `feeds.json`, interests | `news-topics.json` | **`signal-sources.json` (new)** |
| State | `.state/feed-state.json` | none today | **none in v1** (optional later) |
| Rivus Tool | `generate-digest` | `generate-news-brief` | **`generate-signal-brief` (new)** |
| Ranking domain | `domain.ts` | `news-domain.ts` | **`signal-domain.ts` (new)** |

Personal RSS answers “what did sources I trust publish?”  
Signal answers “what rose or shipped in public AI×dev?”  
Those must not share a subscription list.

## Recommended Implementation Tier

| Tier | Scope | Verdict |
| --- | --- | --- |
| A | Only rewrite Doubao queries | Too weak; still one noisy web search |
| **B** | GitHub Search API + HN Algolia + official-domain Doubao search; small noon/evening query/domain boosts | **Choose** |
| C | + Hugging Face + Product Hunt + Trending scrape | Later |

Community practice (technical AI digests, self-hosted agents, AlphaSignal-style scans) converges on multi-source structured signals plus post-hoc ranking, not a single broad web query.

## Sources (v1)

### Updates section

| Source | Role |
| --- | --- |
| Doubao web search constrained to official / allowlisted domains and intent queries | Model and vendor launches |
| Hacker News Algolia (high points and/or Show HN) | Builder-validated products/tools |

### Open-source section

| Source | Role |
| --- | --- |
| GitHub Repository Search API | Rising / high-signal new repos (`created`, `stars`, topics, languages) |

Optional v1.1: important release search for a small watched set of ecosystems. Not required for first ship.

### Shared credentials (already in the project mental model)

- `DOUBAO_SEARCH_API_KEY` for official-domain search
- `GH_FEED_TOKEN` (or equivalent GitHub token) for Search API

HN Algolia is unauthenticated public HTTP.

## Domain Model

```ts
type SignalKind = "model" | "product" | "repo" | "release";
type SignalSection = "updates" | "opensource";

type SignalItem = {
  id: string;
  kind: SignalKind;
  section: SignalSection;
  title: string;
  url: string;
  summary: string;
  sourceLabel: string;
  publishedAt?: string;
  metrics?: {
    stars?: number;
    points?: number;
    createdAt?: string;
    language?: string;
  };
  score: number;
  reasons: string[];
};
```

### Acceptance Filters (illustrative; exact numbers live in config)

**Updates**

- Time window: local calendar day (or rolling 24h if calendar-day search is empty — prefer exact day first, matching news briefs).
- Official domain hits preferred; HN requires minimum points (config).
- Reject empty titles/URLs; canonicalize URLs before dedupe.

**Open source**

- Example query shape: recent `created` window + `stars:>N` + free-text topic OR terms (languages are a scoring bias, not search free-text — GitHub free-text language names are too broad).
- Reject name patterns such as `awesome-` / `awesome_`.
- Prefer non-empty description; penalize missing language when frontend bias is on.

### Scoring

Deterministic only:

- Updates: authority / official-domain boost + HN points + frontend-relevant keyword boost + recency.
- Open source: star count with diminishing returns + newness + language/topic match − list/scaffold penalties.
- Multi-source agreement (same URL/event from official search and HN) may add a small boost after URL canonicalization.

### Quotas

```text
maxTotal: 8
updates: max 5
opensource: max 4
```

Within updates, soft-balance `model` vs `product` so one kind cannot fill the entire section when the other has eligible items.

Selection order:

1. Filter and score all candidates.
2. Partition by section.
3. Apply per-section caps with soft kind balance in updates.
4. Apply global cap.
5. Drop empty sections at render time.

## Configuration

New tracked file: `signal-sources.json` (name may match final loader module).

Illustrative shape:

```json
{
  "timezoneOffsetEnv": "FEED_TIMEZONE_OFFSET",
  "quotas": {
    "maxTotal": 8,
    "updates": 5,
    "opensource": 4
  },
  "frontendBias": {
    "languages": ["TypeScript", "JavaScript"],
    "repoTopics": ["react", "nextjs", "mcp", "agent", "ai"],
    "updateKeywords": ["coding", "agent", "IDE", "SDK", "browser", "TypeScript"]
  },
  "hackerNews": {
    "minPoints": 80,
    "includeShowHn": true,
    "maxItems": 20
  },
  "githubSearch": {
    "createdWithinDays": 7,
    "minStars": 50,
    "languages": ["TypeScript", "JavaScript"],
    "topics": ["ai", "llm", "agent", "mcp"],
    "excludeNamePatterns": ["^awesome[-_]", "^awesome$"]
  },
  "officialSearch": {
    "domains": [
      "openai.com",
      "anthropic.com",
      "ai.google.dev",
      "deepmind.google",
      "huggingface.co",
      "github.blog",
      "vercel.com",
      "cursor.com"
    ],
    "intents": [
      "model release OR announcing OR launched API",
      "product launch OR changelog shipping developer"
    ],
    "countPerQuery": 10
  }
}
```

Rules:

- This file is **not** an RSS subscription list.
- Changing personal blogs still goes through `rss-summary feeds` / `feeds.json` for the morning digest only.
- Domain allowlists may later be shared with news ranking as a pure data import; loaders stay separate.

## Module Boundaries

Aligned with existing separation of ingestion, ranking, render, and Rivus (layered as `domain/` → `application/` → `infrastructure/` → `presentation/`):

```text
src/infrastructure/signal-sources.ts  load/validate signal-sources.json
src/infrastructure/hacker-news.ts     HN Algolia adapter
src/infrastructure/github-search.ts   GitHub Search API adapter (or thin extension of github.ts)
src/domain/signal.ts                  filter, score, dedupe, quotas
src/application/signal-brief.ts       window + fan-out sources + assemble document
src/presentation/signal-render.ts     Markdown: two sections + kind labels
src/presentation/rivus-plugin.ts      register Tool + Automation (no ranking logic inside Plugin)
src/infrastructure/doubao-search.ts   reuse for official-domain / intent queries only
```

CLI (optional but useful for local dry runs):

```bash
rss-summary signal --day YYYY-MM-DD --dry-run
```

If CLI surface is deferred, Rivus Tool + unit tests are still enough for v1, but a dry-run path should exist somehow (Tool invocation or bin).

### Rivus

- New Tool id: `rss-summary/generate-signal-brief`
- Risk: `observe` (read-only)
- Input: `occurrence` (and optional explicit `day`)
- Output: `{ markdown, itemCount, day, sections, warnings }`
- New Automation: e.g. `rss-summary/daily-signal-brief`
- Profile tools allow-list adds the new Tool
- System prompt unchanged in spirit: call only the named Tool, return `markdown` unchanged

## Rendering

```markdown
# 高信号速览 · YYYY-MM-DD

**动态 · N**

1. **[模型] [title](url)**
   One-line summary.
   source · HH:mm

2. **[产品] …**

**开源 · M**

1. **[上升] [owner/repo](url)**
   Description.
   3d · 1.2k★ · TypeScript
```

Constraints:

- Keep mobile/Feishu-friendly density similar to news briefs.
- Summary ≤ ~2 short sentences / ~110 characters when source text is long (reuse news summary compaction ideas, not news topic policy).
- Open-source lines should expose **explainable metrics** (age, stars, language), not only a headline.

## Noon / Evening Quality Lift (Same PR Series Or Follow-Up)

Out of scope for the *identity* of signal brief, but in scope for the overall quality goal:

1. Rewrite `news-topics.json` queries toward intents (launch, outage, regulation) instead of keyword salads.
2. Add domain boosts in `news-domain.ts` using an allowlist (can share domain list data with signal official domains where appropriate).
3. Keep topic coverage biased to industry / policy / capital / broad tech so it does not race signal for “model launch + rising repo”.

Do **not** wire GitHub Search or HN into noon/evening in v1.

## State And Dedup

v1:

- No persistent signal state.
- In-run URL canonicalization + title-feature style event collapse for updates (same event, different publishers).
- Repo identity dedupe for open source (`owner/repo` lowercased).

Later optional:

- `.state/signal-state.json` to suppress re-pushing the same repo/url within N days.
- Cross-product soft demotion if the same URL already appeared in morning digest (not required).

## Testing And Verification

Unit / domain:

- Official vs non-official update ranking
- HN points threshold
- Awesome-list exclusion
- Language/topic frontend bias
- Section quotas and soft model/product balance
- Empty section omitted from markdown
- URL / repo dedupe

Adapter:

- Parse fixtures for GitHub Search and HN Algolia responses
- Doubao client still covered by existing tests; new query construction tested at brief/source layer

Repo gate:

```bash
pnpm verify
```

Manual (with secrets):

- Dry-run signal brief for a real day
- Confirm `feeds.json` is never opened
- Confirm card has at most two sections and ≤ 8 items

## Rollout Plan

1. Land design doc (this file) on a feature branch via PR if desired as docs-only, or with implementation.
2. Implement adapters + domain + render + tests.
3. Wire Rivus Tool/Automation and document env needs in `docs/rivus-plugin.md` + `docs/architecture.md`.
4. Optionally retune `news-topics.json` / news domain boosts in a focused follow-up commit.
5. Enable daily Automation after a few dry runs.

## Mapping To Current News Topics

| Existing `news-topics.json` area | Signal brief | Noon/evening after lift |
| --- | --- | --- |
| AI Agent 与模型 | Primary home for launches (updates) | Keep broader agent/ecosystem news, less “first party launch” pressure |
| 开发工具与开源 | Open-source section + product tools | Broader tool news without star metrics |
| 产品与组织创新 | Product label only when shippable | Org/process stories stay here |
| 基础设施与可靠性 | Only if it is a product/API ship | Outages/reliability stay here |
| 科技政策 / 资本 | Out of signal | Stay in noon/evening |

## Open Decisions (Resolved For v1)

| Decision | Choice |
| --- | --- |
| Taxonomy | Two sections: 动态 + 开源 |
| Merge model/product? | Yes at section level; keep kind labels |
| Frontend bias | Yes, via config languages/topics/keywords |
| RSS coupling | None |
| LLM discovery | No |
| Daily cadence | Once per day |
| Persistent state | No in v1 |
| Implementation tier | B |

## Success Criteria

- A frontend-oriented reader can scan one card and answer: any model/product move worth attention, and any open-source repo worth starring/trying.
- Signal quality does not depend on personal RSS subscription taste.
- Noon/evening can improve independently without inheriting GitHub/HN machinery.
- `pnpm verify` passes; boundaries in architecture docs stay accurate.

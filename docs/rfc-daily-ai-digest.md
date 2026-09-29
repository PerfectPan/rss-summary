# RFC: Source-grounded Daily AI Digest

Status: accepted for implementation

## Decision

`generate-digest` remains the scheduled and on-demand **My subscriptions** product. The existing
`morning-feed-digest` ID continues to invoke it. Daily AI Digest uses the independent
`daily-ai-digest` automation for the rolling 24 hours before each occurrence, so enabling it cannot
silently remove subscription delivery. Noon and evening news keep their current contracts.

The daily product combines the existing seven bounded Doubao queries with curated
first-party sources from `industry-feeds.json`. Every publishable item is backed by public
evidence (`id`, normalized title, canonical URL, published time, cleaned excerpt and
source tier). The Agent owns semantic selection, translation or summarization, and category choice.
Code validates only the structured contract, declared categories, known references, public URLs,
length and duplicates.

The Rivus Tool uses a two-phase contract. `collect` returns normalized evidence but no
deliverable Markdown. The agent edits only structured `{category, headline, refs}` data
from that evidence, then calls `render`. The second phase resolves the original cached
evidence, validates each draft item independently and is the only phase allowed to produce final
Markdown. One malformed item cannot discard valid siblings. When evidence exists but no draft item
is valid, the Tool returns `DAILY_AI_DRAFT_VALIDATION_FAILED` and keeps the evidence snapshot for a
bounded retry.

## Safety and quality invariants

- Categories are: 概览/要闻, 模型发布, 开发生态, 产品应用, 行业动态, 技术与洞察.
- The Agent decides which evidence represents a meaningful event and writes a concise Chinese
  headline without introducing unsupported facts.
- Evidence with the same canonical URL or exact normalized title is merged and cites every
  supporting source; semantic deduplication remains Agent-owned.
- RSS boilerplate, navigation and subscription promotion are removed before editorial use.
- A target of 12–24 is a budget, not a quota; low-quality evidence is omitted.
- Model/editor output is data, never directly deliverable prose. Code does not infer categories or
  semantic validity from title keyword lists, and it never substitutes a source title as fallback.
- Public audit records evidence and decisions but never cookies, tokens or private HTML.
- Every news segment overlapping the rolling window and official-source collection are independent
  failure domains. An all-query Doubao failure is retained as a per-query audit and visible
  source-status warning while remaining collectors continue; the aggregate fails only when no
  collector yields usable evidence.
- Each event links its evidence through compact inline source badges. Repeated labels from the same
  provider collapse to one visible badge, and there is no repeated trailing source list.

## Delivery state

Generation returns an idempotent receipt containing the occurrence and selected evidence
IDs. A receipt is committed only after successful delivery; repeated commits are no-ops,
and failed delivery leaves state unchanged. This boundary is independently testable and
keeps generation retries read-only.

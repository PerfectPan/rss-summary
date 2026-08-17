# RFC: Source-grounded Daily AI Digest

Status: accepted for implementation

## Decision

`generate-digest` remains the scheduled and on-demand **My subscriptions** product. The existing
`morning-feed-digest` ID continues to invoke it. Daily AI Digest uses the independent
`daily-ai-digest` automation for the previous Asia/Shanghai calendar day, so enabling it cannot
silently remove subscription delivery. Noon and evening news keep their current contracts.

The daily product combines the existing seven bounded Doubao queries with curated
first-party sources from `industry-feeds.json`. Every publishable item is backed by public
evidence (`id`, normalized title, canonical URL, published time, cleaned excerpt and
source tier). Editorial output is accepted only after a deterministic validator checks
category, Chinese event shape, known references, public URLs, length, duplicates,
entity overlap and every numeric claim.

The Rivus Tool keeps a two-phase digest contract while the Agent adds a bounded research
step between them. `collect` returns normalized evidence but no deliverable Markdown. The
Agent edits only structured `{category, headline, refs}` data, calls the read-only
`rss-summary/research-article` Tool for selected public URLs, then calls `render` with the
draft and research results. The render phase resolves the original cached evidence, merges
only URL-matched research bodies, validates the draft and is the only phase allowed to
produce final Markdown.

## Safety and quality invariants

- Categories are: 概览/要闻, 模型发布, 开发生态, 产品应用, 行业动态, 技术与洞察.
- Headlines state a subject and an event action. Collection labels such as `Blog`, `Changelog`,
  and `Releases` are not subjects. Repository descriptions and GitHub Home recommendations are
  not news evidence.
- Aggregators cannot be the sole evidence for a major story.
- Duplicate entity/event evidence is merged and cites every supporting source.
- RSS boilerplate, navigation and subscription promotion are removed before editorial use.
- Selected article URLs may be researched through a bounded HTTP Tool; private/local hosts,
  credentials, oversized responses and unreadable bodies are rejected.
- A target of 12–24 is a budget, not a quota; low-quality evidence is omitted.
- Model/editor output is data, never directly deliverable prose. Invalid output falls back only to
  a cleaned source title that is already an event-shaped Chinese sentence; raw English titles are
  omitted instead of receiving a synthetic source-name prefix.
- A model-created entity or numeric claim must occur in its referenced evidence. Merely
  attaching a valid reference ID does not make an unrelated claim publishable.
- Public audit records evidence and decisions but never cookies, tokens or private HTML.
- Each event links its evidence through compact inline source badges. Repeated labels from the same
  provider collapse to one visible badge, and there is no repeated trailing source list.

## Delivery state

Generation returns an idempotent receipt containing the occurrence and selected evidence
IDs. A receipt is committed only after successful delivery; repeated commits are no-ops,
and failed delivery leaves state unchanged. This boundary is independently testable and
keeps generation retries read-only.

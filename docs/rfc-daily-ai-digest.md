# RFC: Source-grounded Daily AI Digest

Status: accepted for implementation

## Decision

`generate-digest` remains the on-demand **My subscriptions** product. The existing
`morning-feed-digest` automation becomes a separate Daily AI Digest for the previous
Asia/Shanghai calendar day. Noon and evening news keep their current contracts.

The daily product combines the existing seven bounded Doubao queries with curated
first-party feeds from `industry-feeds.json`. Every publishable item is backed by public
evidence (`id`, normalized title, canonical URL, published time, cleaned excerpt and
source tier). Editorial output is accepted only after a deterministic validator checks
category, Chinese event shape, known references, public URLs, length and duplicates.

## Safety and quality invariants

- Categories are: 概览/要闻, 模型发布, 开发生态, 产品应用, 行业动态, 技术与洞察.
- Headlines state a subject and an event action. Repository descriptions and GitHub Home
  recommendations are not news evidence.
- Aggregators cannot be the sole evidence for a major story.
- Duplicate entity/event evidence is merged and cites every supporting source.
- RSS boilerplate, navigation and subscription promotion are removed before editorial use.
- A target of 12–24 is a budget, not a quota; low-quality evidence is omitted.
- Model/editor output is data, never directly deliverable prose. Invalid output falls back
  only to an event-shaped cleaned source title.
- Public audit records evidence and decisions but never cookies, tokens or private HTML.

## Delivery state

Generation returns an idempotent receipt containing the occurrence and selected evidence
IDs. A receipt is committed only after successful delivery; repeated commits are no-ops,
and failed delivery leaves state unchanged. This boundary is independently testable and
keeps generation retries read-only.

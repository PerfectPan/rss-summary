# RFC: Source-grounded Daily AI Digest

Status: accepted for implementation

## Decision

`generate-digest` remains the scheduled and on-demand **My subscriptions** product. The existing
`morning-feed-digest` ID continues to invoke it. Daily AI Digest uses the independent
`daily-ai-digest` automation for the rolling 24 hours before each occurrence, so enabling it cannot
silently remove subscription delivery. Noon and evening news keep their time windows and delivery IDs.

The daily product excludes arXiv and sources tagged `Papers` or `Academic` before collection,
because paper candidates are not publishable in this product. Official research announcements
remain eligible; standalone industry collection and the shared source list are unchanged.
It combines the remaining curated first-party sources from `industry-feeds.json` with subscribed
X accounts (ClaudeDevs by default) for its complete rolling window. Broad news search remains a
separate product. The reusable account collector accepts caller-owned windows and shares native
Grok transport, request budgets and caching with news; see [X collection](grok-x-search.md).
Every publishable item is backed by public
evidence (`id`, normalized title, canonical URL, published time, cleaned excerpt and
source tier). The Agent owns semantic selection, translation or summarization, and category choice.
Code validates only the structured contract, declared categories, known references, public URLs,
length and duplicates.

The Rivus Tool uses a two-phase contract. `collect` returns normalized evidence but no
deliverable Markdown. The agent edits only structured `{category, headline, refs}` data
from that evidence, then calls `render`. The second phase resolves the original cached
evidence, validates each draft item independently and is the only phase allowed to produce final
Markdown. One malformed item cannot discard valid siblings. An explicit empty array is a valid editorial decision when no evidence merits delivery. When a
nonempty or malformed draft contains no valid item, the Tool returns `DAILY_AI_DRAFT_VALIDATION_FAILED` and keeps the evidence snapshot for a
bounded retry. The collect message retains every normalized evidence item and full excerpt, plus
source health and counts; it omits per-candidate audit details. The render message contains only
final Markdown, item count, validation issues, warnings, window metadata and delivery receipt.
Full collect/render evidence and audit snapshots are stored locally for recovery, separately from
model messages and business delivery state. This reduces repeated input without imposing an item
quota or discarding source content.

## Safety and quality invariants

- Categories are: 概览/要闻, 模型发布, 开发生态, 产品应用, 行业动态, 技术与洞察.
- The Agent decides which evidence represents a meaningful event and writes a concise Chinese
  headline without introducing unsupported facts.
- Evidence with the same canonical URL or exact normalized title is merged and cites every
  supporting source; semantic deduplication remains Agent-owned.
- RSS boilerplate, navigation and subscription promotion are removed before editorial use.
- Select and order events by user impact without a fixed item count;
  combine versions and changes from the same tool into one event. Version/build-only releases,
  including alpha, beta, preview, rc and nightly builds, are omitted. A prerelease is worth
  including only when evidence supports an important feature, security fix or breaking change;
  explicitly label it as a prerelease. Headlines explain the concrete change and impact, never
  infer features from version numbers. The Tool returns these instructions with collect evidence.
- Model/editor output is data, never directly deliverable prose. Code does not infer categories or
  semantic validity from title keyword lists, and it never substitutes a source title as fallback.
- Local audit snapshots record public evidence and decisions but never cookies, tokens or private HTML.
- X account failures remain in per-account source audit while official collection continues;
  official-source failures retain their source-status warning. The aggregate fails only when no
  collector yields usable evidence. X posts remain model-relayed, unverified evidence with visible
  source labels; a current post about an old event is not a new announcement.
- Each event links its evidence through compact inline source badges. Repeated labels from the same
  provider collapse to one visible badge, and there is no repeated trailing source list.

## Delivery state

Generation returns an idempotent receipt containing the occurrence and selected evidence
IDs. A receipt is committed only after successful delivery; repeated commits are no-ops,
and failed delivery leaves delivery state unchanged. This boundary is independently testable and
keeps generation retries from changing business delivery state or sending messages. X account collection
can still reserve request attempts and update its operational response cache; a repeated collection
is subject to the same shared budget.

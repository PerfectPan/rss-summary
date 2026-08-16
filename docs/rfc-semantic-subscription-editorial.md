# RFC: Semantic Subscription Editorial Pass

## Status

Implemented.

## Problem

The subscriptions pipeline grouped every GitHub event by repository and rendered the collected title and description directly. A repository star, two pull requests, and a feed article could therefore lose their distinct meaning: repository facts such as stars disappeared, PRs looked like repository recommendations, and RSS excerpts were presented without concise Chinese editorial copy.

## Decision

1. Treat repository discovery as one aggregate, but give every pull request and publication a separate candidate identity.
2. Preserve repository facts deterministically from GitHub metadata. The model cannot rewrite stars, language, links, or source identity.
3. Run the scheduled subscriptions Tool in `collect` and `render` phases, following the existing Daily AI orchestration pattern.
4. `collect` exposes bounded typed evidence. Only pull requests and RSS articles with usable source text have `summaryPolicy=required`.
5. The model returns only `Array<{ref, summary}>`, with one or two Chinese sentences per required reference.
6. `render` rejects unknown/duplicate references and numeric claims absent from evidence. One invalid item falls back independently, without discarding other grounded summaries.
7. The Plugin owns content semantics and the channel-neutral presentation. Rivus owns model execution, scheduling, delivery, and channel rendering.
8. Semantic summary expansion is a subscription presentation policy. Industry frontier keeps its existing compact/expanded policy and eight-item expanded cap; subscriptions may expose up to 20 summaries. Collect exposes only the candidates that can fit the rendered sections.
9. Candidate grouping, delivery audit, and editorial references share one semantic identity derived from the source event.

## Non-goals

- Re-editing Daily AI, industry frontier, or noon/evening news output.
- Inferring repository facts or article claims with the model.
- Fetching full article bodies when an RSS source provides no usable excerpt.

## Acceptance

- A repository star and two PRs for the same repository produce three candidates.
- Repository presentation includes the upstream star count and language when present.
- PR and RSS evidence request grounded summaries; repositories do not.
- The render phase reuses the exact collected document and emits only validated or deterministic fallback copy.
- One malformed draft item does not discard valid siblings; the 20-item section bound limits model work to visible candidates.
- CLI JSON/dry-run behavior remains available without requiring a model.

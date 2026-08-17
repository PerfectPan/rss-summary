# Architecture

`rss-summary` is a local TypeScript CLI, a set of portable skills, and an external Rivus Plugin. Scheduling belongs to cron, launchd, systemd, Codex automation, or Rivus; the repository is not a hosted service.

## Product boundaries

The source type does not decide the product. The user's relationship to the source does:

| Product | Question | Sources | State |
| --- | --- | --- | --- |
| My subscriptions | What did sources I deliberately follow publish? | GitHub Home + `feeds.json` personal blogs | `.state/feed-state.json` |
| Industry frontier | What changed at companies and projects I should know about? | curated official RSS/Atom plus verified News / Changelog pages in `industry-feeds.json` | `.state/industry-state.json` |
| Noon/evening news | What happened in the last hours? | event-specific Doubao queries from `news-topics.json`, with official/authoritative source policy | none |
| Daily AI Digest | What important AI events happened yesterday? | the seven bounded Doubao queries + curated first-party `industry-feeds.json` | delivery receipt + public evidence audit |

GitHub Home belongs to subscriptions because it is already personalized. Public GitHub Repository Search and Hacker News discovery are intentionally not a product: they optimize for popularity and novelty rather than the user's explicit subscriptions or curated official sources.

## End-to-end flow

```mermaid
flowchart LR
  Personal["GitHub Home + personal feeds"] --> Collect["collect with per-source status"]
  Official["official RSS/Atom + verified pages"] --> Collect
  Collect --> Window["calendar window"]
  Window --> Rank["rank + explain"]
  Rank --> State["only-new / research state"]
  State --> Depth["link / semantic summary / research"]
  Depth --> Edit["grounded subscription editorial pass"]
  Edit --> Render["Markdown or JSON"]
  Render --> Delivery["stdout / webhook / Rivus"]
  Delivery --> Audit["run artifact / Rivus trace + ledger"]
```

The output depth is separate from ranking:

- `link`: a trusted but ordinary update is one sentence plus its original link.
- `summary`: RSS articles and pull requests always receive semantic space; other candidates expand for an explicit interest match or content-level importance marker (major/GA/breaking/deprecation/security). Repeated mentions, an announcement label, a score, or a release label alone never expands an item.
- `research`: papers are withheld from direct Markdown until the research workflow verifies the original source.

`src/domain/attention.ts` owns this decision. Renderers do not reinterpret scores.

## Layers

| Layer | Responsibility | IO |
| --- | --- | --- |
| `domain` | normalized activity, ranking, research quota, output depth, audit contracts | none |
| `application` | collect, degrade per source, apply state, assemble audit | through adapters |
| `infrastructure` | GitHub/RSS clients, config, state, notifier, run artifact store | yes |
| `presentation` | CLI/Rivus entrypoints and Markdown/JSON rendering | entrypoint wiring |

Dependencies point inward. Domain code must not import application, infrastructure, presentation, Effect, or Node IO. Application code never imports presentation; render functions are injected at the CLI boundary.

## Subscription workflow

The `morning-feed-digest` automation remains the scheduled **My subscriptions** product, preserving
its stable ID and state history. Daily AI Digest uses the separate `daily-ai-digest` automation so
deployments can bind both products without one replacing the other.

`rss-summary digest` runs this sequence:

1. Load GitHub Home configuration and `feeds.json`.
2. Fetch GitHub Home and every RSS feed independently. A failed source is recorded and does not erase successful sources.
3. Filter the explicit calendar day or rolling window.
4. Enrich GitHub candidates with followed users, repository metadata, and bounded PR details when credentials permit. Repository discovery remains grouped by repository; each PR and publication keeps a separate content identity.
5. Rank candidates and bound the paper queue.
6. Under `--only-new`, filter only previously delivered event IDs. Research cache entries do not suppress new subscription events.
7. Assign `link`, `summary`, or `research` presentation depth.
8. In Rivus, run the subscription Tool in three phases. `collect` returns typed evidence, `select` requires the model to decide whether every RSS/GitHub item is worth pushing with a reason, and the Agent uses the read-only `research-article` Tool for selected public URLs before writing per-item summaries. The RSS/GitHub collection, selection, deduplication and delivery path remains unchanged. `render` accepts those research results, filters to `selected=true`, and validates `Array<{ref, summary}>` plus grounded numeric claims. An empty selection is an auditable suppressed run rather than an empty card.
9. Render, deliver, record an audit artifact, then update seen state after successful non-dry delivery.

The CLI remains deterministic and renders source excerpts directly. The scheduled Rivus path adds the model editorial and bounded source-research pass only for selected subscription items. This keeps candidate ingestion/ranking, RSS/GitHub selection, deduplication and delivery inside the existing path, lets the Agent fetch only selected public article bodies through a constrained Tool, and leaves channel layout to Rivus Renderer. The industry frontier, noon/evening news, and Daily AI products retain their existing workflows; an already edited frontier headline is not summarized again by the subscription pass.

GitHub Home uses the saved `.state/github-home-storage.json` session. `GITHUB_HOME_FETCH=conduit` first reads GitHub's conduit response and falls back to a rendered browser page. `GITHUB_FEED_SOURCE=events` is the REST fallback.

## Frontier workflow

`rss-summary industry` never reads GitHub Home or `feeds.json`:

1. Load only `industry-feeds.json` or the isolated `INDUSTRY_SOURCES` override.
2. Fetch official RSS/Atom and configured listing pages independently and record source health.
3. Apply the time window and rank updates.
4. Require paper abstracts to match configured interests and cap the queue at `FEED_MAX_PAPERS` (hard maximum 8).
5. Under `--only-new`, filter delivered and researched identities with `.state/industry-state.json`.
6. Render ordinary updates as one line, expand high-quality updates, and withhold unresearched paper titles from Markdown.

The tracked frontier list deliberately excludes secondary daily aggregators and personal engineering blogs. A personal blog can still be excellent; it belongs in `feeds.json` because the user chose to follow it.

## Daily AI Digest workflow

The Daily AI Digest covers the previous Asia/Shanghai calendar day. It reuses both halves of the
seven-query news search and combines them with the official frontier sources. Evidence is normalized
to public IDs, titles, canonical URLs, timestamps, cleaned excerpts and source tiers. Entity/event
duplicates merge their references. The deterministic validator permits only known references,
the six declared categories, event-shaped Chinese headlines and public URLs. The production Tool
first returns evidence in a `collect` phase, then accepts only structured editorial records in a
`render` phase. It verifies that entities overlap referenced evidence and that every numeric claim
is present in that evidence. Collector labels such as `Blog`,
`Changelog`, and `Releases` are not valid headline subjects. Invalid editorial output falls back
only to source titles that are already event-shaped Chinese sentences; raw English titles are
omitted instead of being wrapped in a synthetic `source published title` sentence. A 12–24 item
target is never a fill quota, and only `render` returns deliverable Markdown. Source references are
rendered as clickable inline badges beside each event; repeated labels from the same provider
collapse to one badge, and the document does not repeat references in a trailing source section.

## Research workflow

The deterministic CLI emits candidates; the portable `$feed-research-digest` skill and the scheduled Rivus `research-article` Tool perform source-based judgment:

```bash
rss-summary digest --json --only-new --dry-run
rss-summary industry --json --only-new --dry-run
```

Normal subscription/frontier entries need no deep research. The skill or Agent Tool spends attention on selected `summary` candidates and papers, opens the original article/repository/release/arXiv page, and keeps the extracted body bounded before editorial validation. Personal research cache avoids repeated investigation but does not hide later subscription events; frontier research state also participates in only-new filtering.

## Audit artifacts

Every CLI `digest` or `industry` run writes a paired artifact under:

```text
.state/runs/YYYY-MM-DD/<subscriptions|frontier>-HHMMSS-<run-id>.json
.state/runs/YYYY-MM-DD/<subscriptions|frontier>-HHMMSS-<run-id>.md
```

The JSON records:

- every source's success/failure, error, and fetched item count;
- fetched, in-window, ranked, selected, and research-pending counts;
- every ranked candidate's score, output depth, typed presentation reason/evidence, and selected/filtered decision;
- delivery status, channel, completion time, and failure message.

Inspect it with:

```bash
rss-summary runs list
rss-summary runs failures
rss-summary runs show <run-label-or-json-path>
```

`FEED_RUN_LOG_DIR` changes the root. The directory remains under `.state/` by default and must not be committed. Rivus Tools remain read-only: their structured result includes the source/candidate audit, while Rivus records actual card delivery in its trace and delivery ledger.

## Rendering and limits

`src/presentation/candidate-brief.ts` owns the shared two-depth layout. Product renderers supply only labels and metadata. Both preserve all selected categories instead of applying one global slice; each expanded and compact section is capped at 20. Papers are counted but hidden from direct Markdown.

The news product keeps its own domain because authority validation, topic quotas, time windows, and eight-story cap differ materially from subscription ranking.

Its search configuration contains structured event intents rather than umbrella topics: a stable query ID, required subjects, required event terms, an intent code, explicit noise exclusions, and an allowed source class. Requests are restricted to the local calendar day, automatic query rewriting is disabled, and the application then applies the exact noon/evening window and relevance policy to each result. The time filter protects delivery boundaries; it is not used as a substitute for a precise query.

News ranking uses within-query position, source authority, and freshness. A URL returned by multiple queries receives only a bounded tie-break bonus; it is not treated as independent corroboration. The Tool result carries a per-query audit with provider log ID, fetched/accepted counts, rejection reasons, canonical duplicate counts, semantic-title duplicate counts, quota filtering, and the eight-item cap.

## State semantics

- `--only-new --dry-run`: preview without changing seen/researched state; CLI still records a dry-run audit.
- `--only-new`: record delivered event IDs after successful output.
- `--json`: expose candidates plus audit for agent workflows.
- `.state/feed-state.json`: subscription delivery state and reusable research cache.
- `.state/industry-state.json`: independent frontier delivery/research state.
- `.state/runs`: append-only operational evidence, not filtering state.

## Extension points

- Add a personal source with `rss-summary feeds add`; this changes `feeds.json`.
- Add a frontier RSS/Atom source when it is first-party. A `page` source additionally requires a same-origin path prefix, explicit dates, policy review, fixture coverage, and a live dry-run; edit `industry-feeds.json` intentionally.
- Adjust importance in `src/domain/digest.ts`; adjust display depth in `src/domain/attention.ts`.
- Add a source adapter returning `ActivityCard[]` and source health, then wire it at the application boundary.
- Add a delivery adapter beside `src/infrastructure/notifier.ts` without moving delivery into domain logic.
- Add semantic duplicate detection before ranking if canonical URL/title identity becomes insufficient.

## Known constraints

- GitHub Home parsing depends on GitHub's internal conduit/DOM shape.
- On machines that require `HTTP_PROXY`/`HTTPS_PROXY`, Node 24 must start with `NODE_USE_ENV_PROXY=1` for native fetch to use those variables.
- CLI summaries use feed/repository text unless the research skill has inspected the original source. Scheduled Rivus subscription summaries are model-edited from bounded PR/RSS evidence, and selected URLs can be upgraded with the Agent's bounded research result before validation; failed research falls back to source text only when the item remains explicitly selected.
- RSS identity dedupe is deterministic, not semantic.
- Official page ingestion depends on stable same-origin links and explicit date markup. Zero valid dated links is audited as parser failure instead of an empty day.
- The generic webhook cannot confirm downstream rendering; Rivus provides the stronger delivery ledger.
- The repository has no built-in daemon.

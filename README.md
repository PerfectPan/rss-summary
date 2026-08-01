# rss-summary

Scheduled GitHub Home, RSS, and authoritative web-news briefs for `PerfectPan`.

The tool reads the GitHub Home feed plus optional RSS/Atom feeds, enriches interesting repositories and pull requests, ranks projects/articles by usefulness, then outputs a short Markdown digest. Its Rivus Plugin also builds bounded noon and evening briefs from Doubao web search and a daily 高信号速览 from GitHub Search, Hacker News, and official-domain search. Source collection is read-only unless you wire a webhook notification endpoint for the CLI path.

## GitHub Home Exact Mode

`GITHUB_FEED_SOURCE=home` is the default because GitHub's REST `received_events` API does not match github.com Home exactly. The Home page includes user filter settings, ranking, trending repositories, popular projects among followed people, and recommendation cards.

Home exact mode uses a saved Playwright storage state. By default, `GITHUB_HOME_FETCH=conduit` fetches GitHub's internal `/conduit/for_you_feed?requested_from_filter_event=true` Turbo frame with that web session, parses the returned HTML, and uses GitHub's own `data-hydro-view.feed_card` metadata for card type, position, gatherer, and timestamp.

If the conduit request fails or returns no supported feed cards, the CLI automatically falls back to rendered browser mode: it opens `https://github.com/`, waits for `feed-container` / `conduit-feed-frame`, and parses the rendered cards. Set `GITHUB_HOME_FETCH=browser` to skip the direct conduit request.

The REST API path is still available with `GITHUB_FEED_SOURCE=events`, but it is a fallback approximation, not the source of truth for GitHub Home.

## Setup

```bash
pnpm install
pnpm build
pnpm setup
pnpm link --global
cp .env.example .env
```

Commands below use the linked `rss-summary` bin. If a machine has not linked the bin yet, use `pnpm exec rss-summary ...` from the repository root as the fallback.

Create the GitHub Home browser storage state once:

```bash
rss-summary github-home login
```

This opens a browser. Sign in to GitHub, confirm `https://github.com/` shows Home, then press Enter in the terminal. The login state is saved to `.state/github-home-storage.json`, which must stay out of git.

By default the CLI launches the local Chrome channel. If a scheduled machine does not have Chrome, install Chrome or run `pnpm exec playwright install chromium` and unset `GITHUB_HOME_BROWSER_CHANNEL`.

Optionally create a fine-grained GitHub token from the `PerfectPan` account and put it in `GH_FEED_TOKEN` for API enrichment or `GITHUB_FEED_SOURCE=events` fallback.

Minimum recommended permissions:

- Account permission: `Events: Read-only`
- Repository access: public repositories only for the first version
- Add selected private repositories with read-only metadata / pull request access only if private activity should be summarized

RSS sources are maintained in the tracked `feeds.json` file. Update it intentionally and send feed changes through the normal pull request workflow.

Manage RSS sources with the CLI:

```bash
rss-summary feeds add --url "https://github.blog/feed" --name "GitHub Blog" --tags "github,ai,developer-tools"
rss-summary feeds list
rss-summary feeds test
rss-summary feeds remove --url "https://github.blog/feed"
```

Use `--file <path>` only for feed-management experiments. The digest command always loads RSS sources from the tracked `feeds.json`.

## Run

Dry run:

```bash
GITHUB_FEED_SOURCE=home GITHUB_USERNAME=PerfectPan rss-summary digest --dry-run
```

Preview only new high-signal candidates as JSON for a research skill or model pipeline:

```bash
GITHUB_FEED_SOURCE=home \
GITHUB_HOME_FETCH=conduit \
GITHUB_USERNAME=PerfectPan \
FEED_DAY="$(TZ=Asia/Shanghai date +%F)" \
rss-summary digest --json --only-new --dry-run
```

Use [prompts/feed-research.md](prompts/feed-research.md) as the portable model prompt for turning that JSON into the final daily brief. The Codex wrapper skill at [skills/feed-research-digest/SKILL.md](skills/feed-research-digest/SKILL.md) uses the same prompt, so another machine can run the same flow without depending on Codex-specific skill behavior.

Run the daily digest and mark emitted candidates as seen:

```bash
GITHUB_FEED_SOURCE=home \
GITHUB_USERNAME=PerfectPan \
FEED_DAY="$(TZ=Asia/Shanghai date +%F)" \
rss-summary digest --only-new
```

With RSS feeds:

```bash
GITHUB_FEED_SOURCE=home \
GITHUB_USERNAME=PerfectPan \
rss-summary digest --dry-run
```

RSS-only preview, useful before a GitHub token is configured:

```bash
rss-summary digest --rss-only --window-hours 24 --dry-run
```

With a generic webhook:

```bash
GITHUB_FEED_SOURCE=home \
GITHUB_USERNAME=PerfectPan \
NOTIFY_WEBHOOK_URL="https://example.com/webhook" \
rss-summary digest
```

Fallback to the REST received-events approximation:

```bash
GITHUB_FEED_SOURCE=events \
GH_FEED_TOKEN="$(gh auth token)" \
GITHUB_USERNAME=PerfectPan \
rss-summary digest --dry-run
```

The webhook payload is:

```json
{ "text": "# Feed Digest - ..." }
```

## Time window

By default, the CLI uses a rolling `FEED_WINDOW_HOURS=36` window for compatibility. For scheduled daily summaries, prefer an explicit calendar day:

```bash
rss-summary digest --day 2026-06-27 --timezone-offset +08:00 --only-new
```

Equivalent environment variables:

- `FEED_DAY=YYYY-MM-DD`
- `FEED_TIMEZONE_OFFSET=+08:00`
- `FEED_WINDOW_HOURS=36` for the legacy rolling-hour mode when `FEED_DAY` is not set

## Signal brief dry run

The daily 高信号速览 CLI is read-only and needs no state:

```bash
rss-summary signal --day "$(TZ=Asia/Shanghai date +%F)" --dry-run
```

`--dry-run` is accepted for parity with `digest`; the signal command never writes state or sends webhooks either way. Set `DOUBAO_SEARCH_API_KEY` for the official-search updates section (optional; Hacker News and GitHub Search still work without it) and `GH_FEED_TOKEN` to raise the GitHub Search rate limit.

## Schedule on another machine

Install Node.js 24+, clone or copy this repository, run `pnpm install && pnpm build && pnpm setup && pnpm link --global`, run `rss-summary github-home login` once on that machine, then schedule:

```cron
0 9 * * * cd /path/to/rss-summary && FEED_DAY="$(TZ=Asia/Shanghai date +\%F)" GITHUB_FEED_SOURCE=home GITHUB_HOME_FETCH=conduit GITHUB_USERNAME=PerfectPan RSS_FEEDS_FILE=feeds.json rss-summary digest --only-new >> /tmp/feed-digest.log 2>&1
```

Use the browser login from the account whose Home Feed should be summarized. The machine identity does not matter; the saved GitHub web session does.

## Rivus Agent Plugin

This repository exports `rss-summary/rivus-plugin`, a real external Rivus Plugin with one Agent profile, three read-only Tools, and four production Automation templates:

- profile: `rss-digest`
- feed Tool: `rss-summary/generate-digest`
- news Tool: `rss-summary/generate-news-brief`
- signal Tool: `rss-summary/generate-signal-brief`
- morning template: `rss-summary/morning-feed-digest`
- noon template: `rss-summary/noon-news-brief`
- evening template: `rss-summary/evening-news-brief`
- signal template: `rss-summary/daily-signal-brief`

The 09:00 morning template summarizes the previous local calendar day's GitHub Home and RSS items. The 12:30 and 19:00 templates search six curated areas: AI Agents and models, developer tools and open source, product and organization innovation, infrastructure and reliability, technology policy, and capital and industry signals. Noon covers local 00:00–12:30; evening covers local 12:30 through its occurrence, so the scheduled windows do not overlap. Technology-policy results require Doubao's very-authoritative source level; the other areas accept authoritative sources. The packaged policy selects at most eight stories per brief and collapses near-identical event headlines reported through different publisher URLs. News cards link from each headline and keep every item to a compact two-sentence summary plus source and time. Topics and quotas live in the packaged `news-topics.json`.

The 21:00 signal template (高信号速览) answers “what shipped or rose in public AI×dev today” from GitHub Repository Search, Hacker News Algolia, and official-domain Doubao search. It renders at most two sections — 动态 (`模型`/`产品`) and 开源 (`上升` with age/stars/language) — omits empty sections, caps at 8 items, and never reads `feeds.json`. Tuning lives in the packaged `signal-sources.json`; see [docs/signal-brief-design.md](docs/signal-brief-design.md).

All three Tools are observe-only. The feed Tool runs in dry-run mode, so it neither sends the generic webhook nor marks candidates as seen. Rivus owns scheduling and Feishu delivery for all four briefs.

With `@rivus/agent@0.3.x`, proactive Feishu delivery renders that Markdown as one interactive card. `技术订阅日报 · YYYY-MM-DD` becomes the blue card header; the source summary, ranked sections, and item links remain in the Markdown body.

Build this checkout before installing it into a Rivus deployment project:

```bash
cd /path/to/rss-summary
pnpm install
pnpm build

cd /path/to/rivus-project
npm install /path/to/rss-summary
```

Then reference `rss-summary/rivus-plugin` from the deployment manifest. Keep `RSS_FEEDS_FILE` and `GITHUB_HOME_STORAGE_STATE` as absolute paths when those files remain in this checkout. See [docs/rivus-plugin.md](docs/rivus-plugin.md) for the manifest bindings, environment contract, and verification steps.

## Development workflow

Run the same local harness as GitHub Actions before opening or merging a change:

```bash
pnpm verify
```

`main` is protected for pull request-based changes. Work on a `codex/...` branch, open a PR, and merge after the `Verify` check passes.

## Current architecture

For the full architecture, data flow, and extension points, see [docs/architecture.md](docs/architecture.md).

The source tree is layered domain → application → infrastructure → presentation:

- `src/domain/digest.ts`: normalizes source events into activity cards, scores high-signal repos/articles, and records reasons.
- `src/domain/news.ts`: validates time/source policy, canonicalizes URLs, deduplicates, ranks, and applies topic quotas.
- `src/domain/signal.ts`: filters, scores, canonicalizes/dedupes, and applies signal quotas and soft model/product balance.
- `src/domain/time.ts`: resolves rolling-hour or explicit calendar-day filtering windows.
- `src/domain/text.ts`: shared URL canonicalization, publish-time parsing, summary compaction, and same-event collapse.
- `src/application/digest.ts`: digest collection/enrichment/state orchestration (Effect-based use case).
- `src/application/news-brief.ts`: orchestrates bounded noon/evening search windows and partial-failure handling.
- `src/application/signal-brief.ts`: orchestrates the daily signal window across Doubao official search, Hacker News, and GitHub Search.
- `src/infrastructure/config.ts`: reads env, args, and `feeds.json`.
- `src/infrastructure/github-home.ts`: exact GitHub Home adapter using Playwright storage state, direct conduit HTML parsing, and rendered-browser fallback.
- `src/infrastructure/github.ts`: read-only GitHub API client for received-events fallback, following list, repositories, and PR details.
- `src/infrastructure/rss.ts`: RSS 2.0 / Atom source adapter built on `fast-xml-parser`.
- `src/infrastructure/doubao-search.ts`: calls the Doubao web-search API with exact-day and source-authority filters.
- `src/infrastructure/hacker-news.ts`: Hacker News Algolia adapter for builder-validated products/tools.
- `src/infrastructure/github-search.ts`: GitHub Repository Search adapter and query builder.
- `src/infrastructure/signal-sources.ts`: loads and validates `signal-sources.json` (quotas, frontend bias, scoring, source tuning).
- `src/infrastructure/news-topics.ts`: loads and validates `news-topics.json`.
- `src/infrastructure/feed-store.ts`: JSON file operations for feed subscriptions.
- `src/infrastructure/state.ts`: stores seen event IDs in `.state/feed-state.json` so daily runs can focus on new items.
- `src/infrastructure/notifier.ts`: prints to stdout and optionally POSTs `{ "text": markdown }` to a generic webhook.
- `src/infrastructure/parsing.ts`: shared validation and JSON response helpers.
- `src/presentation/cli.ts`: package `bin` entrypoint for `rss-summary digest`, `rss-summary feeds`, and `rss-summary signal`.
- `src/presentation/feeds-cli.ts`: CLI for adding, listing, and validating local RSS sources.
- `src/presentation/rivus-digest.ts`: maps Rivus Tool input to the existing read-only feed workflow.
- `src/presentation/rivus-plugin.ts`: registers the external Rivus profile, three Tools, and Automation templates.
- `src/presentation/render.ts`: renders Markdown sections for project discovery, RSS articles, project activity, and releases.
- `src/presentation/news-render.ts`: renders mobile-friendly noon/evening Feishu Markdown.
- `src/presentation/signal-render.ts`: renders the two-section 高信号速览 Markdown.

Side effects are managed with [Effect](https://effect.website): application use cases return `Effect<Result, Error>` and presentation entrypoints run them via `Effect.runPromise`; domain rules stay framework-free and purely deterministic.

`feeds.json` is tracked as the shared RSS subscription list. `news-topics.json` is tracked as the web-news topic policy. `signal-sources.json` is tracked as the signal-brief tuning policy (not an RSS subscription list). `.state/` remains gitignored because it contains local run state.

## Research notes

See `docs/competitive-research.md` for the competitor scan behind the RSS design. The short version: Feedly, Inoreader, Readwise Reader, and Folo all treat RSS value as a combination of source management, filtering/deduplication, and selective AI, not raw timeline summarization.
See `docs/digest-delivery-research.md` for the recommended daily summary and push model.

## Codex skill

The portable Codex skills live at:

```text
skills/github-feed-digest
skills/feed-research-digest
skills/rss-feed-management
```

Use `$github-feed-digest` to configure/run the automation. Use `$feed-research-digest` when you want Codex to inspect the new JSON candidates and produce an actionable daily research summary.
Use `$rss-feed-management` when adding or validating RSS/Atom sources.

# rss-summary

Daily GitHub Home Feed and RSS digest for `PerfectPan`.

The tool reads the rendered GitHub Home page plus optional RSS/Atom feeds, enriches interesting repositories and pull requests, ranks projects/articles by usefulness, then outputs a short Markdown digest. It is read-only against GitHub and RSS sources unless you wire a webhook notification endpoint.

## GitHub Home Exact Mode

`GITHUB_FEED_SOURCE=home` is the default because GitHub's REST `received_events` API does not match github.com Home exactly. The Home page includes user filter settings, ranking, trending repositories, popular projects among followed people, and recommendation cards.

Home exact mode opens `https://github.com/` with a saved Playwright storage state, reads the rendered `feed-container` / `conduit-feed-frame` cards, and uses GitHub's own `data-hydro-view.feed_card` metadata for card type, position, gatherer, and timestamp.

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

Use `--file <path>` when the feed list is not `feeds.json`. The lower-level development fallback is `pnpm feeds -- <command>`.
For one-off experiments, `RSS_FEEDS` can still provide a JSON array without modifying `feeds.json`.

## Run

Dry run:

```bash
GITHUB_FEED_SOURCE=home GITHUB_USERNAME=PerfectPan rss-summary digest --dry-run
```

Preview only new high-signal candidates as JSON for a research skill or model pipeline:

```bash
GITHUB_FEED_SOURCE=home \
GITHUB_USERNAME=PerfectPan \
RSS_FEEDS_FILE=feeds.json \
FEED_DAY="$(TZ=Asia/Shanghai date +%F)" \
rss-summary digest --json --only-new --dry-run
```

Run the daily digest and mark emitted candidates as seen:

```bash
GITHUB_FEED_SOURCE=home \
GITHUB_USERNAME=PerfectPan \
RSS_FEEDS_FILE=feeds.json \
FEED_DAY="$(TZ=Asia/Shanghai date +%F)" \
rss-summary digest --only-new
```

With RSS feeds:

```bash
GITHUB_FEED_SOURCE=home \
GITHUB_USERNAME=PerfectPan \
RSS_FEEDS_FILE=feeds.json \
rss-summary digest --dry-run
```

With a generic webhook:

```bash
GITHUB_FEED_SOURCE=home \
GITHUB_USERNAME=PerfectPan \
RSS_FEEDS_FILE=feeds.json \
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

## Schedule on another machine

Install Node.js 24+, clone or copy this repository, run `pnpm install && pnpm build && pnpm setup && pnpm link --global`, run `rss-summary github-home login` once on that machine, then schedule:

```cron
0 9 * * * cd /path/to/rss-summary && FEED_DAY="$(TZ=Asia/Shanghai date +\%F)" GITHUB_FEED_SOURCE=home GITHUB_USERNAME=PerfectPan RSS_FEEDS_FILE=feeds.json rss-summary digest --only-new >> /tmp/feed-digest.log 2>&1
```

Use the browser login from the account whose Home Feed should be summarized. The machine identity does not matter; the saved GitHub web session does.

## Development workflow

Run the same local harness as GitHub Actions before opening or merging a change:

```bash
pnpm verify
```

`main` is protected for pull request-based changes. Work on a `codex/...` branch, open a PR, and merge after the `Verify` check passes.

## Current architecture

For the full architecture, data flow, and extension points, see [docs/architecture.md](docs/architecture.md).

- `src/github-home.ts`: exact GitHub Home page adapter using Playwright storage state and rendered Home card metadata.
- `src/github.ts`: read-only GitHub API client for received-events fallback, following list, repositories, and PR details.
- `src/cli.ts`: package `bin` entrypoint for `rss-summary digest` and `rss-summary feeds`.
- `src/rss.ts`: RSS 2.0 / Atom source adapter built on `fast-xml-parser`.
- `src/feeds.ts`: CLI for adding, listing, and validating local RSS sources.
- `src/feed-store.ts`: JSON file operations for feed subscriptions.
- `src/domain.ts`: normalizes source events into activity cards, scores high-signal repos/articles, and records reasons.
- `src/event-window.ts`: resolves rolling-hour or explicit calendar-day filtering windows.
- `src/state.ts`: stores seen event IDs in `.state/feed-state.json` so daily runs can focus on new items.
- `src/render.ts`: renders Markdown sections for project discovery, RSS articles, project activity, and releases.
- `src/notifier.ts`: prints to stdout and optionally POSTs `{ "text": markdown }` to a generic webhook.

`feeds.json` is tracked as the shared RSS subscription list. `.state/` remains gitignored because it contains local run state.

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

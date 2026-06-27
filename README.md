# rss-summary

Daily GitHub Home Feed and RSS digest for `PerfectPan`.

The tool reads GitHub's received events API plus optional RSS/Atom feeds, enriches interesting repositories and pull requests, ranks projects/articles by usefulness, then outputs a short Markdown digest. It is read-only against GitHub and RSS sources unless you wire a webhook notification endpoint.

## Why `received_events`

`GET /users/{username}/received_events` is the closest API source for the GitHub Home Feed: events received from watched repositories and followed users. When the token belongs to the same `{username}`, GitHub can include private events the token is allowed to read. With another account's token, GitHub only returns public events.

## Setup

```bash
npm ci
cp .env.example .env
```

Create a fine-grained GitHub token from the `PerfectPan` account and put it in `GH_FEED_TOKEN`.

Minimum recommended permissions:

- Account permission: `Events: Read-only`
- Repository access: public repositories only for the first version
- Add selected private repositories with read-only metadata / pull request access only if private activity should be summarized

Optional RSS setup:

```bash
cp feeds.example.json feeds.json
```

Edit `feeds.json` locally:

```json
[
  {
    "name": "Deno Blog",
    "url": "https://deno.com/feed",
    "tags": ["deno", "runtime", "typescript"]
  }
]
```

`feeds.json` is intentionally gitignored because it may reveal personal reading interests. For ephemeral runs, use `RSS_FEEDS` with the same JSON array.

## Run

Dry run:

```bash
GH_FEED_TOKEN="$(gh auth token)" GITHUB_USERNAME=PerfectPan npm run digest -- --dry-run
```

Preview only new high-signal candidates as JSON for a research skill or model pipeline:

```bash
GH_FEED_TOKEN="$(gh auth token)" \
GITHUB_USERNAME=PerfectPan \
RSS_FEEDS_FILE=feeds.json \
FEED_DAY="$(TZ=Asia/Shanghai date +%F)" \
npm run --silent digest -- --json --only-new --dry-run
```

Run the daily digest and mark emitted candidates as seen:

```bash
GH_FEED_TOKEN="$(gh auth token)" \
GITHUB_USERNAME=PerfectPan \
RSS_FEEDS_FILE=feeds.json \
FEED_DAY="$(TZ=Asia/Shanghai date +%F)" \
npm run --silent digest -- --only-new
```

With RSS feeds:

```bash
GH_FEED_TOKEN="$(gh auth token)" \
GITHUB_USERNAME=PerfectPan \
RSS_FEEDS_FILE=feeds.json \
npm run digest -- --dry-run
```

With a generic webhook:

```bash
GH_FEED_TOKEN="..." \
GITHUB_USERNAME=PerfectPan \
RSS_FEEDS_FILE=feeds.json \
NOTIFY_WEBHOOK_URL="https://example.com/webhook" \
npm run digest
```

The webhook payload is:

```json
{ "text": "# Feed Digest - ..." }
```

## Time window

By default, the CLI uses a rolling `FEED_WINDOW_HOURS=36` window for compatibility. For scheduled daily summaries, prefer an explicit calendar day:

```bash
npm run --silent digest -- --day 2026-06-27 --timezone-offset +08:00 --only-new
```

Equivalent environment variables:

- `FEED_DAY=YYYY-MM-DD`
- `FEED_TIMEZONE_OFFSET=+08:00`
- `FEED_WINDOW_HOURS=36` for the legacy rolling-hour mode when `FEED_DAY` is not set

## Schedule on another machine

Install Node.js 24+, clone or copy this repository, run `npm ci`, then schedule:

```cron
0 9 * * * cd /path/to/rss-summary && FEED_DAY="$(TZ=Asia/Shanghai date +\%F)" GH_FEED_TOKEN=... GITHUB_USERNAME=PerfectPan RSS_FEEDS_FILE=feeds.json npm run --silent digest -- --only-new >> /tmp/feed-digest.log 2>&1
```

Use the `GH_FEED_TOKEN` from the account whose Home Feed should be summarized. The machine identity does not matter; the token identity does.

## Current architecture

- `src/github.ts`: read-only GitHub API client for received events, following list, repositories, and PR details.
- `src/rss.ts`: RSS 2.0 / Atom source adapter built on `fast-xml-parser`.
- `src/domain.ts`: normalizes source events into activity cards, scores high-signal repos/articles, and records reasons.
- `src/event-window.ts`: resolves rolling-hour or explicit calendar-day filtering windows.
- `src/state.ts`: stores seen event IDs in `.state/feed-state.json` so daily runs can focus on new items.
- `src/render.ts`: renders Markdown sections for project discovery, RSS articles, project activity, and releases.
- `src/notifier.ts`: prints to stdout and optionally POSTs `{ "text": markdown }` to a generic webhook.

`feeds.json` and `.state/` are intentionally gitignored because they contain personal subscriptions and local run state.

## Research notes

See `docs/competitive-research.md` for the competitor scan behind the RSS design. The short version: Feedly, Inoreader, Readwise Reader, and Folo all treat RSS value as a combination of source management, filtering/deduplication, and selective AI, not raw timeline summarization.

## Codex skill

The portable Codex skills live at:

```text
skills/github-feed-digest
skills/feed-research-digest
```

Use `$github-feed-digest` to configure/run the automation. Use `$feed-research-digest` when you want Codex to inspect the new JSON candidates and produce an actionable daily research summary.

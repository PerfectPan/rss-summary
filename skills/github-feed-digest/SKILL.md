---
name: github-feed-digest
description: Run, configure, or migrate the rss-summary GitHub Home Feed and RSS digest automation. Use when the user wants a daily summary of GitHub received_events, RSS/Atom feeds, read-only GitHub token setup, webhook/stdout delivery, or the same digest on another machine.
---

# GitHub Feed Digest

Use the local `rss-summary` project to summarize GitHub Home Feed-like activity from `GET /users/{username}/received_events` plus optional RSS/Atom feeds.

## Core Rule

The GitHub identity comes from the token, not the machine. To summarize `PerfectPan`'s full received feed, run with a read-only token issued by the `PerfectPan` account. A token from another account can only see `PerfectPan`'s public received events.

## Required Setup

1. Locate the project root containing `package.json`.
2. Install dependencies with `pnpm install`.
3. Build and link the CLI with `pnpm build && pnpm setup && pnpm link --global`.
4. Set `GH_FEED_TOKEN` to a read-only GitHub token.
5. Set `GITHUB_USERNAME=PerfectPan` unless the user asks for another account.
6. Optionally copy `feeds.example.json` to `feeds.json` and set `RSS_FEEDS_FILE=feeds.json`.
7. Optionally set `NOTIFY_WEBHOOK_URL` for generic webhook delivery.

Minimum token permissions:

- `Events: Read-only`
- Public repositories only for first use
- Add selected private repositories with read-only access only when private repo events must be summarized

## Commands

Dry run:

```bash
GH_FEED_TOKEN="..." GITHUB_USERNAME=PerfectPan RSS_FEEDS_FILE=feeds.json rss-summary digest --dry-run
```

Preview new candidates for research:

```bash
GH_FEED_TOKEN="..." GITHUB_USERNAME=PerfectPan RSS_FEEDS_FILE=feeds.json FEED_DAY="$(TZ=Asia/Shanghai date +%F)" rss-summary digest --json --only-new --dry-run
```

Send to webhook:

```bash
GH_FEED_TOKEN="..." GITHUB_USERNAME=PerfectPan RSS_FEEDS_FILE=feeds.json FEED_DAY="$(TZ=Asia/Shanghai date +%F)" NOTIFY_WEBHOOK_URL="https://example.com/webhook" rss-summary digest --only-new
```

Cron example:

```cron
0 9 * * * cd /path/to/rss-summary && FEED_DAY="$(TZ=Asia/Shanghai date +\%F)" GH_FEED_TOKEN=... GITHUB_USERNAME=PerfectPan RSS_FEEDS_FILE=feeds.json rss-summary digest --only-new >> /tmp/feed-digest.log 2>&1
```

## Time Window

- Use `FEED_DAY=YYYY-MM-DD` or `--day YYYY-MM-DD` for a calendar-day digest.
- The default timezone offset is `+08:00`; override with `FEED_TIMEZONE_OFFSET` or `--timezone-offset`.
- If no day is set, the CLI falls back to rolling `FEED_WINDOW_HOURS=36`.

## Output Shape

The digest is Markdown with project-focused sections:

- `值得看`: project discovery signals such as followee stars, forks, and new repositories.
- `RSS 文章`: matching RSS/Atom articles from configured feeds.
- `项目动态`: useful PR activity, especially merged PRs and repeated repo activity.
- `版本发布`: release signals.

Do not summarize raw GitHub events as a flat timeline. Explain why each repository may matter.

## Daily New State

- `--only-new --dry-run` previews new candidates without mutating state.
- `--only-new` writes seen event IDs to `.state/feed-state.json` after output.
- `--json` emits machine-readable candidates for `$feed-research-digest`.
- `--day YYYY-MM-DD` filters to that calendar day in the configured timezone offset.
- Do not commit `.state/` or `feeds.json`.

## Troubleshooting

- Empty digest: confirm `FEED_DAY`, widen `FEED_WINDOW_HOURS` for rolling mode, or increase `FEED_EVENT_PAGES`.
- Missing RSS items: confirm `RSS_FEEDS_FILE` points at a JSON array and that the feed publishes RSS 2.0 or Atom.
- Missing private events: ensure the token belongs to the same username and has read access to those repositories.
- Webhook failure: rerun with `--dry-run` to isolate GitHub fetching from delivery.
- Rate limit pressure: reduce `FEED_EVENT_PAGES` or `FEED_MAX_REPOS`.

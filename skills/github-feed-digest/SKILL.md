---
name: github-feed-digest
description: Run, configure, inspect, or migrate the rss-summary personal subscription automation that combines the user's exact GitHub Home feed with explicitly followed RSS/Atom blogs. Use for GitHub Home login setup, subscription delivery, run audits, troubleshooting, or reproducing the same personal feed on another machine.
---

# GitHub Feed Digest

Use the local `rss-summary` project to deliver one personal subscription stream: exact GitHub Home plus explicitly followed RSS/Atom sources from `feeds.json`.

## Core Rule

The GitHub identity comes from the saved GitHub web session in `GITHUB_FEED_SOURCE=home` mode. To summarize `PerfectPan`'s Home feed, run `rss-summary github-home login` on the scheduled machine while signed into the `PerfectPan` GitHub account. A token-only `received_events` fallback is available with `GITHUB_FEED_SOURCE=events`, but it is not GitHub Home parity.

## Required Setup

1. Locate the project root containing `package.json`.
2. Install dependencies with `pnpm install`.
3. Build and link the CLI with `pnpm build && pnpm link --global`.
4. Run `rss-summary github-home login` once to create `.state/github-home-storage.json`.
5. Set `GITHUB_FEED_SOURCE=home`.
6. Keep `GITHUB_HOME_FETCH=conduit` for the direct internal Turbo frame fast path with browser fallback, or set `GITHUB_HOME_FETCH=browser` to skip the direct request.
7. Set `GITHUB_USERNAME=PerfectPan` unless the user asks for another account.
8. Use the tracked `feeds.json` as the shared RSS source list. Set `RSS_FEEDS_FILE=feeds.json` only when being explicit; the CLI defaults to that path.
9. Optionally set `GH_FEED_TOKEN` for GitHub API enrichment or `GITHUB_FEED_SOURCE=events` fallback.
10. Optionally set `NOTIFY_WEBHOOK_URL` for generic webhook delivery.

Minimum token permissions for fallback/enrichment:

- `Events: Read-only`
- Public repositories only for first use
- Add selected private repositories with read-only access only when private repo events must be summarized

## Commands

Dry run:

```bash
GITHUB_FEED_SOURCE=home GITHUB_HOME_FETCH=conduit GITHUB_USERNAME=PerfectPan RSS_FEEDS_FILE=feeds.json rss-summary digest --dry-run
```

Preview new candidates for research:

```bash
GITHUB_FEED_SOURCE=home GITHUB_HOME_FETCH=conduit GITHUB_USERNAME=PerfectPan RSS_FEEDS_FILE=feeds.json FEED_DAY="$(TZ=Asia/Shanghai date +%F)" rss-summary digest --json --only-new --dry-run
```

Send to webhook:

```bash
GITHUB_FEED_SOURCE=home GITHUB_HOME_FETCH=conduit GITHUB_USERNAME=PerfectPan RSS_FEEDS_FILE=feeds.json FEED_DAY="$(TZ=Asia/Shanghai date +%F)" NOTIFY_WEBHOOK_URL="https://example.com/webhook" rss-summary digest --only-new
```

Cron example:

```cron
0 9 * * * cd /path/to/rss-summary && FEED_DAY="$(TZ=Asia/Shanghai date +\%F)" GITHUB_FEED_SOURCE=home GITHUB_HOME_FETCH=conduit GITHUB_USERNAME=PerfectPan RSS_FEEDS_FILE=feeds.json rss-summary digest --only-new >> /tmp/feed-digest.log 2>&1
```

## Time Window

- Use `FEED_DAY=YYYY-MM-DD` or `--day YYYY-MM-DD` for a calendar-day digest.
- The default timezone offset is `+08:00`; override with `FEED_TIMEZONE_OFFSET` or `--timezone-offset`.
- If no day is set, the CLI falls back to rolling `FEED_WINDOW_HOURS=36`.

## Output Shape

The brief uses attention depth, not source-type sections:

- `重点摘要`: strong releases, repeated GitHub Home signals, interest matches, and actionable changes.
- `其他更新`: ordinary trusted updates, each kept to one sentence plus the original link.

Do not drop a new explicitly subscribed item only because it lacks broad popularity. Use `$feed-research-digest` when an item deserves source-based investigation.

## Daily New State

- `--only-new --dry-run` previews new candidates without mutating state.
- `--only-new` writes seen event IDs to `.state/feed-state.json` after output.
- `--json` emits machine-readable candidates for `$feed-research-digest`.
- `--day YYYY-MM-DD` filters to that calendar day in the configured timezone offset.
- Do not commit `.state/`. Commit intentional `feeds.json` subscription changes through a pull request.
- Direct CLI runs write paired audit JSON/Markdown under `.state/runs`; inspect them with `rss-summary runs list`, `runs failures`, or `runs show`.
- Research cache avoids repeated deep investigation but does not suppress a later new subscription event.

## Troubleshooting

- Empty digest: confirm `FEED_DAY`, widen `FEED_WINDOW_HOURS` for rolling mode, or increase `FEED_EVENT_PAGES`.
- Missing RSS items: confirm `RSS_FEEDS_FILE` points at a JSON array and that the feed publishes RSS 2.0 or Atom.
- Missing GitHub Home cards: run `rss-summary github-home login` again and confirm `.state/github-home-storage.json` exists on that machine.
- Direct conduit failure: leave `GITHUB_HOME_FETCH=conduit`; the CLI falls back to browser rendering automatically. Use `GITHUB_HOME_FETCH=browser` only when direct requests are consistently problematic.
- Browser launch failure: install Chrome, or run `pnpm exec playwright install chromium` and unset `GITHUB_HOME_BROWSER_CHANNEL`.
- Need token-only fallback: set `GITHUB_FEED_SOURCE=events` and ensure the token belongs to the same username and has read access to those repositories.
- Webhook failure: rerun with `--dry-run` to isolate GitHub fetching from delivery.
- Rate limit pressure: reduce `FEED_EVENT_PAGES` or `FEED_MAX_REPOS`.

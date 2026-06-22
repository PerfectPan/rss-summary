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

## Schedule on another machine

Install Node.js 24+, clone or copy this repository, run `npm ci`, then schedule:

```cron
0 9 * * * cd /path/to/rss-summary && GH_FEED_TOKEN=... GITHUB_USERNAME=PerfectPan RSS_FEEDS_FILE=feeds.json npm run digest >> /tmp/feed-digest.log 2>&1
```

Use the `GH_FEED_TOKEN` from the account whose Home Feed should be summarized. The machine identity does not matter; the token identity does.

## Current architecture

- `src/github.ts`: read-only GitHub API client for received events, following list, repositories, and PR details.
- `src/rss.ts`: RSS 2.0 / Atom source adapter built on `fast-xml-parser`.
- `src/domain.ts`: normalizes source events into activity cards, scores high-signal repos/articles, and records reasons.
- `src/render.ts`: renders Markdown sections for project discovery, RSS articles, project activity, and releases.
- `src/notifier.ts`: prints to stdout and optionally POSTs `{ "text": markdown }` to a generic webhook.

The next durable step before deep automatic research is a small cache of researched repo/article IDs so repeated daily runs do not re-investigate the same item.

## Research notes

See `docs/competitive-research.md` for the competitor scan behind the RSS design. The short version: Feedly, Inoreader, Readwise Reader, and Folo all treat RSS value as a combination of source management, filtering/deduplication, and selective AI, not raw timeline summarization.

## Codex skill

The portable Codex skill lives at:

```text
skills/github-feed-digest
```

Copy that directory into another machine's `$CODEX_HOME/skills/` or keep it with this repository and explicitly ask Codex to use `$github-feed-digest`.

# rss-summary

Daily GitHub Home Feed digest for `PerfectPan`.

The tool reads GitHub's received events API, enriches interesting repositories and pull requests, ranks projects by usefulness, then outputs a short Markdown digest. It is read-only against GitHub unless you wire a webhook notification endpoint.

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

## Run

Dry run:

```bash
GH_FEED_TOKEN="$(gh auth token)" GITHUB_USERNAME=PerfectPan npm run digest -- --dry-run
```

With a generic webhook:

```bash
GH_FEED_TOKEN="..." \
GITHUB_USERNAME=PerfectPan \
NOTIFY_WEBHOOK_URL="https://example.com/webhook" \
npm run digest
```

The webhook payload is:

```json
{ "text": "# GitHub Feed Digest - ..." }
```

## Schedule on another machine

Install Node.js 24+, clone or copy this repository, run `npm ci`, then schedule:

```cron
0 9 * * * cd /path/to/rss-summary && GH_FEED_TOKEN=... GITHUB_USERNAME=PerfectPan npm run digest >> /tmp/github-feed-digest.log 2>&1
```

Use the `GH_FEED_TOKEN` from the account whose Home Feed should be summarized. The machine identity does not matter; the token identity does.

## Codex skill

The portable Codex skill lives at:

```text
skills/github-feed-digest
```

Copy that directory into another machine's `$CODEX_HOME/skills/` or keep it with this repository and explicitly ask Codex to use `$github-feed-digest`.

---
name: rss-feed-management
description: Use when adding, listing, validating, or troubleshooting RSS/Atom sources for the rss-summary project, especially when updating feeds.json or preparing a portable daily feed digest on another machine.
---

# RSS Feed Management

Use the repository CLI for deterministic RSS source changes. Do not hand-edit `feeds.json` unless the CLI cannot express the needed change.

Run `pnpm install && pnpm build && pnpm setup && pnpm link --global` from the project root first. Use `pnpm exec rss-summary ...` from the repository root only as a fallback when the bin is not linked.

## Commands

Run from the `rss-summary` project root:

```bash
rss-summary feeds add --url "https://example.com/feed.xml" --name "Example" --tags "ai,agent,mcp"
rss-summary feeds list
rss-summary feeds test
rss-summary feeds remove --url "https://example.com/feed.xml"
```

Use `--file <path>` when working with a non-default feed file. The lower-level development fallback is `pnpm feeds -- <command>`.

## Workflow

Feed additions and removals both go through pull requests. Do not push `feeds.json` changes directly to `main`, even when the change is only one URL.

1. Create a short-lived branch from `main`.
2. Add or remove the source with the CLI:

```bash
rss-summary feeds add --url "https://example.com/feed.xml" --name "Example" --tags "ai,agent,mcp"
rss-summary feeds remove --url "https://example.com/feed.xml"
```

3. Validate parsing with `rss-summary feeds test`.
4. Preview candidates for the target day:

```bash
RSS_FEEDS_FILE=feeds.json FEED_DAY="$(TZ=Asia/Shanghai date +%F)" rss-summary digest --json --dry-run
```

5. Run `pnpm verify`.
6. Commit `feeds.json` and related docs/tests, push the branch, and open a pull request.

## Tagging

Use tags as ranking hints, not categories for display. Prefer terms already used by `FEED_INTERESTS`, such as `ai`, `agent`, `mcp`, `typescript`, `rust`, `deno`, `testing`, `performance`, and `skills`.

## Notes

- RSS 2.0 and Atom are supported.
- `feeds.json` is tracked as this repository's shared RSS subscription list.
- For one-off runs, `RSS_FEEDS='[...]'` still works, but the CLI is preferred for persistent sources.

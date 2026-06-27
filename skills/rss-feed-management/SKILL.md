---
name: rss-feed-management
description: Use when adding, listing, validating, or troubleshooting RSS/Atom sources for the rss-summary project, especially when updating feeds.json or preparing a portable daily feed digest on another machine.
---

# RSS Feed Management

Use the repository CLI for deterministic RSS source changes. Do not hand-edit `feeds.json` unless the CLI cannot express the needed change.

## Commands

Run from the `rss-summary` project root:

```bash
npm run feeds -- add --url "https://example.com/feed.xml" --name "Example" --tags "ai,agent,mcp"
npm run feeds -- list
npm run feeds -- test
```

Use `--file <path>` when working with a non-default feed file.

## Workflow

1. Add the source with `npm run feeds -- add`.
2. Validate parsing with `npm run feeds -- test`.
3. Preview candidates for the target day:

```bash
RSS_FEEDS_FILE=feeds.json FEED_DAY="$(TZ=Asia/Shanghai date +%F)" npm run --silent digest -- --json --dry-run
```

4. Keep `feeds.json` local and uncommitted unless the user explicitly asks to share a feed set.

## Tagging

Use tags as ranking hints, not categories for display. Prefer terms already used by `FEED_INTERESTS`, such as `ai`, `agent`, `mcp`, `typescript`, `rust`, `deno`, `testing`, `performance`, and `skills`.

## Notes

- RSS 2.0 and Atom are supported.
- `feeds.json` is gitignored because it can reveal personal reading interests.
- For one-off runs, `RSS_FEEDS='[...]'` still works, but the CLI is preferred for persistent sources.

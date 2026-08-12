# RFC: Official Web Page Sources

Status: implemented
Date: 2026-08-13

## Motivation

Some first-party vendors publish important updates on a News or Changelog page without exposing
RSS or Atom. Treating `/news` as a universal feed is not viable: the path is conventional rather
than standardized, HTML structures differ, some pages need JavaScript, and some sites prohibit or
block automated collection. The frontier and Daily AI products still need a bounded way to consume
eligible first-party pages without weakening provenance or silently reporting an empty source.

## Decision

Keep RSS/Atom as the preferred source. Add an explicit `page` industry source for an official,
server-rendered listing page when all of these are true:

- the site's automation policy permits access and the production Node client can fetch the page;
- each update has a same-origin link under a configured path prefix;
- the listing exposes a machine-readable `<time datetime>` or an unambiguous English calendar date;
- a live dry-run proves titles, timestamps, source health, filtering, and final candidates.

The adapter fetches one configured page, retries only transient network failures, HTTP 429, and
HTTP 5xx responses, and extracts only dated same-origin links under `pathPrefixes`. It normalizes
them into `ActivityCard` values with `source: "web"`; the existing time window, ranking, only-new
state, rendering, evidence, and audit pipeline remains unchanged. Zero valid entries is a source
failure, not a healthy empty result, because it usually means the page structure drifted.

Example:

```json
{
  "type": "page",
  "name": "Vendor News",
  "url": "https://vendor.example/news",
  "pathPrefixes": ["/news/"],
  "tags": ["Articles", "News"]
}
```

## Boundaries

- Personal `feeds.json` remains RSS/Atom-only and continues to use `rss-summary feeds`.
- `industry-feeds.json` is the curated first-party source registry and may contain RSS/Atom entries
  or explicit `page` entries.
- Page sources do not run a browser, execute site JavaScript, crawl article bodies, follow external
  links, guess `/news`, or use Sitemap `lastmod` as a publication timestamp.
- A blocked page is not bypassed with a browser-like identity or a proxy feed. xAI returned HTTP 403
  to the production Node client and Meta's robots policy restricts automated collection, so neither
  is included in the initial set.

## Initial Sources

- Anthropic News: `https://www.anthropic.com/news`, articles under `/news/`.
- Cursor Changelog: `https://cursor.com/changelog`, entries under `/changelog/`.

Both were verified through the production CLI in a dry-run window: 13 Anthropic entries and 5
Cursor entries were collected, and dated candidates retained their real titles and canonical URLs.

## Operational Consequences

The source audit reports `kind: "web-page"`, item count, and any fetch/parser error. Page markup may
change, so a failed source should be investigated as parser drift before changing ranking or time
filters. Adding another page source requires browser policy inspection, a production-client fetch,
fixture coverage when a new markup shape appears, and a real CLI dry-run.

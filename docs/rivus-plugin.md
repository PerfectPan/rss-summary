# Rivus Agent Plugin

`rss-summary/rivus-plugin` is an external Plugin for `@rivus/agent`. The Host owns scheduling, model execution, channel rendering, Feishu delivery, credentials, traces, and the delivery ledger. This package owns source collection, filtering, ranking, audit data, and presentation semantics.

Each Automation returns two compatible views of the same result: canonical Markdown remains the durable fallback, while `createPresentation` projects that Markdown into the channel-neutral Automation Presentation IR (`kind`, `title`, metadata, sections, items, notes, and source links). The adapter treats an explicit `来源：...` line as the semantic label for the preceding link rather than as a second item note, keeps collection labels out of event headlines, gives common providers readable badge labels, and collapses repeated provider badges per item. A modern Rivus Host renders the IR with native channel components; an older Host safely falls back to Markdown. The Plugin never emits CardKit JSON or chooses Feishu colors, spacing, buttons, or containers.

## Registered surface

| Kind | ID | Purpose |
| --- | --- | --- |
| Agent profile | `rss-digest` | Allows only the five rss-summary Tools |
| Tool | `rss-summary/generate-digest` | GitHub Home + explicitly subscribed personal RSS |
| Tool | `rss-summary/research-article` | render or fetch one Agent-selected public article URL |
| Tool | `rss-summary/generate-industry-brief` | curated official feeds and verified pages; papers stay pending |
| Tool | `rss-summary/generate-news-brief` | bounded noon/evening authoritative web news |
| Tool | `rss-summary/generate-daily-ai-digest` | two-phase grounded Daily AI evidence editing and rendering |
| Automation | `rss-summary/morning-feed-digest` | previous Asia/Shanghai calendar day's personal subscriptions |
| Automation | `rss-summary/daily-ai-digest` | previous Asia/Shanghai calendar day's Daily AI Digest |
| Automation | `rss-summary/daily-industry-brief` | current local calendar day's frontier updates |
| Automation | `rss-summary/noon-news-brief` | current day 00:00 through noon occurrence |
| Automation | `rss-summary/evening-news-brief` | current day 12:30 through evening occurrence |

All Tools have `observe` risk. Feed Tools force dry-run mode: they read only-new state but do not send a webhook, write seen state, or write local run artifacts. Their structured result includes the source/candidate audit. The news Tool includes its query/rejection/selection audit. Rivus records the subsequent card delivery in its trace and Feishu delivery ledger.

Public GitHub Repository Search and Hacker News discovery are intentionally absent. GitHub Home belongs to personal subscriptions; industry discovery comes from curated first-party RSS/Atom and explicitly configured official pages.

## Install

Use Node.js 24.11 or newer within Node 24 LTS and build the package before installing it into Rivus:

```bash
cd /path/to/rss-summary
pnpm install
pnpm verify

cd /path/to/rivus-project
npm install /path/to/rss-summary
```

The supported `@rivus/agent` peer range is `>=0.12.7 <0.14.0`, covering the 0.12 and 0.13 runtime lines used by
the production deployment and the version exercised by repository tests.

## Bind the Plugin

The important manifest portion is the Plugin, one matching Agent/Endpoint, and the exact Tool allowlist:

```json
{
  "plugins": [
    { "id": "rss-summary", "module": "rss-summary/rivus-plugin", "required": true }
  ],
  "defaultAgentId": "rss-digest",
  "defaultEndpointId": "feishu-rss-digest",
  "agents": [
    {
      "agentId": "rss-digest",
      "endpointIds": ["feishu-rss-digest"],
      "memory": { "scopes": [], "tool": false },
      "pluginId": "rss-summary",
      "profileId": "rss-digest",
      "skills": { "allow": [] },
      "tools": {
        "allow": [
          "rss-summary/generate-digest",
          "rss-summary/research-article",
          "rss-summary/generate-daily-ai-digest",
          "rss-summary/generate-industry-brief",
          "rss-summary/generate-news-brief"
        ]
      }
    }
  ],
  "endpoints": [
    {
      "agentId": "rss-digest",
      "baseUrl": "https://open.feishu.cn",
      "credentialRef": "env:RIVUS_FEISHU",
      "enabled": true,
      "groupPolicy": "mention-only",
      "id": "feishu-rss-digest",
      "required": true,
      "sessionNamespace": "rss-digest",
      "streamMinIntervalMs": 200
    }
  ]
}
```

Add Automation instances referencing the templates above. The morning subscriptions and Daily AI templates both resolve the previous local day but remain independently scheduled and delivered; industry uses the current local day; noon/evening use non-overlapping news windows. On modern Hosts, Rivus renders the Plugin-owned Automation Presentation IR; the first Markdown heading remains the legacy card-header fallback.

## Configure sources

Use absolute paths in the Rivus project's private environment because the daemon runs from that project:

```dotenv
FEED_TIMEZONE_OFFSET=+08:00
GITHUB_FEED_SOURCE=home
GITHUB_HOME_FETCH=conduit
GITHUB_HOME_STORAGE_STATE=/path/to/rss-summary/.state/github-home-storage.json
GITHUB_USERNAME=PerfectPan
RSS_FEEDS_FILE=/path/to/rss-summary/feeds.json
FEED_STATE_FILE=/path/to/rss-summary/.state/feed-state.json
INDUSTRY_SOURCES_FILE=/path/to/rss-summary/industry-feeds.json
INDUSTRY_STATE_FILE=/path/to/rss-summary/.state/industry-state.json
FEED_MAX_PAPERS=8
DOUBAO_SEARCH_API_KEY=replace-with-doubao-search-api-key
NEWS_TOPICS_FILE=/path/to/rss-summary/news-topics.json
GH_FEED_TOKEN=replace-with-github-token
RIVUS_RSS_DIGEST_TARGET=replace-with-union-id
```

Do not set `NOTIFY_WEBHOOK_URL` for the Plugin path; Rivus owns delivery. Browser storage, API keys, and tokens remain local secrets.

The subscription research Tool uses browser-first mode by default. On a Mac mini with Chrome installed, set
`RSS_ARTICLE_BROWSER_CHANNEL=chrome` (the default), keep `RSS_ARTICLE_BROWSER_HEADLESS=true` for daemon runs,
and optionally tune `RSS_ARTICLE_BROWSER_TIMEOUT_MS`. If the browser cannot render a page, the Tool falls back
to its bounded HTTP extractor; pass `mode:"browser"` to require browser research or `mode:"http"` to skip it.

The news Tool reads `DOUBAO_SEARCH_API_KEY` from the Node process environment. If the Rivus CLI's environment-file option only configures the Host, also load the file into Node:

```bash
node --env-file=/path/to/rivus-project/.env.local \
  ./node_modules/@rivus/agent/dist/cli.js \
  --env-file /path/to/rivus-project/.env.local \
  --bootstrap ./src/bootstrap.ts \
  --manifest ./rivus.config.json
```

## Audit and delivery evidence

The digest and industry Tool results contain an `audit` object with:

- source successes/failures and item counts;
- fetched/in-window/ranked/selected counts;
- per-candidate score, presentation depth, typed presentation reason/evidence, and decision.

The news Tool's `audit` records each structured query's provider log ID, result counts, deterministic rejection reasons (`outside-window`, `insufficient-authority`, `intent-mismatch`, and others), canonical/title deduplication, topic quota filtering, and the final brief cap. Selected stories also expose a score breakdown for query rank, authority, freshness, and the bounded cross-query tie-break.

The subscriptions Tool uses a bounded three-phase contract in scheduled runs. `collect` returns typed evidence and deterministic repository facts. The profile model must then make a second-pass decision for every evidence item through `select`, with a short reason; ordinary star/watch activity, duplicates, low-information changes, title-only changes, and items without a user-relevant value should be rejected. For selected public URLs, the Agent calls `rss-summary/research-article` with `mode:"auto"`; the Tool opens an isolated Chrome/Chromium page first, waits for rendered content, and falls back to HTTP if browser research fails. The Agent passes the bounded body into `render` as research evidence. This research step improves only the selected item's grounded summary; the RSS/GitHub collection, selection, deduplication and delivery path stays the same. Summary wording follows the Daily AI Digest single-event style: subject, action, concrete change/result and impact, in one or two sentences. `render` accepts the complete selection plus research and `Array<{ref, summary}>`, filters the document to `selected=true`, validates references and numeric claims, and returns Markdown. If the selection is empty, the profile returns `RIVUS_AUTOMATION_SUPPRESSED:` with a reason so Rivus records the run without creating a delivery. The frontier/news products do not pass through this subscription editor.

The Tool cannot honestly claim Feishu delivery because delivery happens after Tool execution. Use the Rivus run trace for the exact Tool result and its Feishu delivery ledger for target, attempt, idempotency, and outcome. Direct CLI runs instead write paired `.state/runs/...json` and `.md` artifacts.

## Verify

```bash
cd /path/to/rss-summary
pnpm verify

cd /path/to/rivus-project
npm run doctor
npm run check-config
```

Invoke each enabled template once in the foreground. Confirm the morning subscriptions trace contains `collect`, `select`, `research-article`, and `render` calls, every evidence item has an AI decision and reason, research results are URL-matched and bounded, repository rows retain deterministic stars/language facts, PR/RSS rows contain grounded summaries only when selected, and an empty selection is recorded as suppressed without a delivery. Confirm the separate Daily AI card covers the previous local calendar day, the frontier trace lists only official `industry-feeds.json` sources (including `web-page` source health), noon/evening windows do not overlap, the structured card keeps semantic source links inline with each item without right-side button columns or a duplicate source appendix, and the delivery ledger records the card outcome before enabling the service manager.

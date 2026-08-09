# Rivus Agent Plugin

`rss-summary/rivus-plugin` is an external Plugin for `@rivus/agent`. The Host owns scheduling, model execution, Feishu delivery, credentials, traces, and the delivery ledger. This package owns source collection, filtering, ranking, audit data, and Markdown rendering.

## Registered surface

| Kind | ID | Purpose |
| --- | --- | --- |
| Agent profile | `rss-digest` | Allows only the three rss-summary Tools |
| Tool | `rss-summary/generate-digest` | GitHub Home + explicitly subscribed personal RSS |
| Tool | `rss-summary/generate-industry-brief` | curated official frontier feeds; papers stay pending |
| Tool | `rss-summary/generate-news-brief` | bounded noon/evening authoritative web news |
| Automation | `rss-summary/morning-feed-digest` | previous local calendar day's subscriptions |
| Automation | `rss-summary/daily-industry-brief` | current local calendar day's frontier updates |
| Automation | `rss-summary/noon-news-brief` | current day 00:00 through noon occurrence |
| Automation | `rss-summary/evening-news-brief` | current day 12:30 through evening occurrence |

All Tools have `observe` risk. Feed Tools force dry-run mode: they read only-new state but do not send a webhook, write seen state, or write local run artifacts. Their structured result includes the source/candidate audit. The news Tool includes its query/rejection/selection audit. Rivus records the subsequent card delivery in its trace and Feishu delivery ledger.

Public GitHub Repository Search and Hacker News discovery are intentionally absent. GitHub Home belongs to personal subscriptions; industry discovery comes from curated first-party feeds.

## Install

Use Node.js 24.11 or newer within Node 24 LTS and build the package before installing it into Rivus:

```bash
cd /path/to/rss-summary
pnpm install
pnpm verify

cd /path/to/rivus-project
npm install /path/to/rss-summary
```

The supported `@rivus/agent` peer range is `>=0.1.1 <0.4.0`.

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

Add Automation instances referencing the templates above. The morning template resolves the previous local day; industry uses the current local day; noon/evening use non-overlapping news windows. Rivus promotes the first Markdown heading into the Feishu card header.

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
INDUSTRY_FEEDS_FILE=/path/to/rss-summary/industry-feeds.json
INDUSTRY_STATE_FILE=/path/to/rss-summary/.state/industry-state.json
FEED_MAX_PAPERS=8
DOUBAO_SEARCH_API_KEY=replace-with-doubao-search-api-key
NEWS_TOPICS_FILE=/path/to/rss-summary/news-topics.json
GH_FEED_TOKEN=replace-with-github-token
RIVUS_RSS_DIGEST_TARGET=replace-with-union-id
```

Do not set `NOTIFY_WEBHOOK_URL` for the Plugin path; Rivus owns delivery. Browser storage, API keys, and tokens remain local secrets.

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

The Tool cannot honestly claim Feishu delivery because delivery happens after Tool execution. Use the Rivus run trace for the exact Tool result and its Feishu delivery ledger for target, attempt, idempotency, and outcome. Direct CLI runs instead write paired `.state/runs/...json` and `.md` artifacts.

## Verify

```bash
cd /path/to/rss-summary
pnpm verify

cd /path/to/rivus-project
npm run doctor
npm run check-config
```

Invoke each enabled template once in the foreground. Confirm the morning card covers the previous local calendar day, the frontier trace lists only official `industry-feeds.json` sources, noon/evening windows do not overlap, each Tool call returns unchanged Markdown, and the delivery ledger records the card outcome before enabling the service manager.

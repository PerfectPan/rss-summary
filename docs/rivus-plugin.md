# Rivus Agent Plugin

`rss-summary/rivus-plugin` is an external Plugin for `@rivus/agent`. The host owns scheduling, model execution, delivery, and credentials. This package owns feed/news collection, ranking, filtering, deduplication, and Markdown rendering.

## Registered Surface

| Kind | ID | Purpose |
| --- | --- | --- |
| Agent profile | `rss-digest` | Allows only the two rss-summary Tools; no Skills or Memory scopes |
| Tool | `rss-summary/generate-digest` | Builds a read-only GitHub Home + RSS digest |
| Tool | `rss-summary/generate-news-brief` | Builds a bounded Doubao web-search news brief |
| Automation template | `rss-summary/morning-feed-digest` | Previous local calendar day's GitHub Home + RSS |
| Automation template | `rss-summary/noon-news-brief` | Current day 00:00 through the noon occurrence |
| Automation template | `rss-summary/evening-news-brief` | Current day 12:30 through the evening occurrence |
| Legacy template | `rss-summary/daily-digest` | Same-day feed digest kept for existing deployments |

Both Tools have `observe` risk. The feed Tool forces `--dry-run`, so it never invokes `NOTIFY_WEBHOOK_URL` and never updates `.state/feed-state.json`. With `onlyNew` enabled, it may read the state file to filter already seen items. The news Tool performs read-only search requests and does not persist delivery state.

## Install From This Checkout

Use Node.js 24.11 or newer within the Node 24 LTS line. Build the package first because the deployment loads its compiled ESM export:

```bash
cd /path/to/rss-summary
pnpm install
pnpm verify

cd /path/to/rivus-project
npm install /path/to/rss-summary
```

The Rivus project supplies the `@rivus/agent` peer. The supported Core range is `>=0.1.1 <0.4.0`; use `0.3.x` for proactive Feishu interactive-card delivery.

## Bind The Plugin

Replace the starter `rivus.config.json` created by `rivus init` with the complete binding below. An Endpoint belongs to exactly one Agent, so the starter's `feishu-agent-a` Endpoint must not be reused while it is still bound to `agent-a`. This example replaces both starter IDs with the RSS Agent and a dedicated matching Endpoint:

```json
{
  "plugins": [
    {
      "id": "rss-summary",
      "module": "rss-summary/rivus-plugin",
      "required": true
    }
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
      "experimental": { "cotMessages": false },
      "groupPolicy": "mention-only",
      "id": "feishu-rss-digest",
      "required": true,
      "sessionNamespace": "rss-digest",
      "streamMinIntervalMs": 200
    }
  ],
  "automations": [
    {
      "agentId": "rss-digest",
      "delivery": {
        "endpointId": "feishu-rss-digest",
        "targetRef": "env:RIVUS_RSS_DIGEST_TARGET",
        "targetType": "union_id"
      },
      "enabled": true,
      "id": "morning-rss-digest",
      "required": true,
      "schedule": "0 9 * * *",
      "templateId": "rss-summary/morning-feed-digest",
      "timeZone": "Asia/Shanghai"
    },
    {
      "agentId": "rss-digest",
      "delivery": {
        "endpointId": "feishu-rss-digest",
        "targetRef": "env:RIVUS_RSS_DIGEST_TARGET",
        "targetType": "union_id"
      },
      "enabled": true,
      "id": "noon-news-brief",
      "required": true,
      "schedule": "30 12 * * *",
      "templateId": "rss-summary/noon-news-brief",
      "timeZone": "Asia/Shanghai"
    },
    {
      "agentId": "rss-digest",
      "delivery": {
        "endpointId": "feishu-rss-digest",
        "targetRef": "env:RIVUS_RSS_DIGEST_TARGET",
        "targetType": "union_id"
      },
      "enabled": true,
      "id": "evening-news-brief",
      "required": true,
      "schedule": "0 19 * * *",
      "templateId": "rss-summary/evening-news-brief",
      "timeZone": "Asia/Shanghai"
    }
  ]
}
```

Each Automation input contains the exact scheduled ISO occurrence. The morning template resolves the previous local calendar day using `FEED_TIMEZONE_OFFSET`. Noon searches local 00:00–12:30; evening searches from local 12:30 to its occurrence. These non-overlapping windows avoid replaying noon stories in the evening without coupling search to delivery-state persistence.

The rendered Markdown starts with `# 技术订阅日报 · YYYY-MM-DD`, `# 午间热点 · YYYY-MM-DD`, or `# 晚间热点 · YYYY-MM-DD`. Rivus promotes that heading into the interactive-card header and keeps the compact sections and links in the card body. The Plugin does not call Feishu directly; delivery credentials, target identity, idempotency, and retries remain Host responsibilities.

## Configure Sources

Set the existing `rss-summary` variables in the Rivus project's private `.env.local`. Use absolute paths because the daemon runs from the Rivus project, not this checkout:

```dotenv
FEED_TIMEZONE_OFFSET=+08:00
GITHUB_FEED_SOURCE=home
GITHUB_HOME_FETCH=conduit
GITHUB_HOME_STORAGE_STATE=/path/to/rss-summary/.state/github-home-storage.json
GITHUB_USERNAME=PerfectPan
RSS_FEEDS_FILE=/path/to/rss-summary/feeds.json
DOUBAO_SEARCH_API_KEY=replace-with-doubao-search-api-key
# Optional; the packaged default already contains the six curated brief areas.
NEWS_TOPICS_FILE=/path/to/rss-summary/news-topics.json
RIVUS_RSS_DIGEST_TARGET=replace-with-union-id
```

`news-topics.json` defines query sets, per-topic quotas, and source policy. The packaged policy covers AI Agents and models, developer tools and open source, product and organization innovation, infrastructure and reliability, technology policy, and capital and industry signals. Their quotas total eight selected stories, while seven queries per run keep two daily briefs within roughly 420 searches in a 30-day month before manual verification. Title-feature containment collapses the same event when publishers use different URLs. Technology policy uses `official`, which requires `AuthInfoLevel=1`; the other areas use `authoritative`, which accepts levels 1–2. Custom policies are bounded to 8 topics, 8 queries per topic, 32 queries overall, and 10 selected items per topic before any paid request starts. The renderer removes duplicated search-result prefixes, limits each story to two sentences and 110 characters, links the headline directly, and keeps source plus time on one metadata line. `NEWS_SEARCH_COUNT_PER_QUERY` defaults to 10 and `NEWS_SEARCH_TIMEOUT_MS` defaults to 15000. If one query fails, the brief includes a source-status warning and continues with successful queries; if all queries fail, the Tool fails so Rivus can apply its normal failure handling.

Do not set `NOTIFY_WEBHOOK_URL` for the Plugin path; Rivus owns delivery. API keys, GitHub tokens, and browser storage remain local secrets and must not be committed.

The news Tool reads `DOUBAO_SEARCH_API_KEY` from the Node process environment. Rivus' CLI `--env-file` supplies variables to the Host bootstrap but does not add them to `process.env`, so a service must also export the variables before Node starts. One reliable launch form is to let Node load the same private file, while retaining Rivus' flag for Host configuration:

```bash
cd /path/to/rivus-project
node --env-file=/path/to/rivus-project/.env.local \
  ./node_modules/@rivus/agent/dist/cli.js \
  --env-file /path/to/rivus-project/.env.local \
  --bootstrap ./src/bootstrap.ts \
  --manifest ./rivus.config.json
```

Use the equivalent process-environment configuration in launchd or systemd. Treat a foreground Tool invocation as the credential acceptance check; `doctor` and `check-config` do not execute the external Tool.

## Verify

Validate both packages before activating the schedule:

```bash
cd /path/to/rss-summary
pnpm verify

cd /path/to/rivus-project
npm run doctor
npm run check-config
node --env-file=/path/to/rivus-project/.env.local \
  ./node_modules/@rivus/agent/dist/cli.js \
  --env-file /path/to/rivus-project/.env.local \
  --bootstrap ./src/bootstrap.ts \
  --manifest ./rivus.config.json
```

In the foreground run, invoke each template once and confirm the trace contains exactly its requested Tool call followed by unchanged Markdown. Verify the morning card is for the previous local day, the noon card starts at 00:00, the evening card starts at 12:30, the brief contains at most eight stories, and technology-policy links are level-1 sources. Only then enable the service manager and all three Automations.

# Rivus Agent Plugin

`rss-summary/rivus-plugin` is an external Plugin for `@rivus/agent`. The host owns scheduling, model execution, delivery, and credentials. This package owns feed collection, ranking, state filtering, and Markdown rendering.

## Registered Surface

| Kind | ID | Purpose |
| --- | --- | --- |
| Agent profile | `rss-digest` | Allows only the digest Tool; no Skills or Memory scopes |
| Tool | `rss-summary/generate-digest` | Builds a read-only Markdown digest |
| Automation template | `rss-summary/daily-digest` | Calls the Tool once with the scheduled occurrence |

The Tool has `observe` risk. It forces `--dry-run`, so it never invokes `NOTIFY_WEBHOOK_URL` and never updates `.state/feed-state.json`. With `onlyNew` enabled, it may read the state file to filter already seen items.

## Install From This Checkout

Use Node.js 24.11 or newer within the Node 24 LTS line. Build the package first because the deployment loads its compiled ESM export:

```bash
cd /path/to/rss-summary
pnpm install
pnpm verify

cd /path/to/rivus-project
npm install /path/to/rss-summary
```

The Rivus project supplies the `@rivus/agent` peer. The supported Core range is `>=0.1.1 <0.3.0`.

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
      "tools": { "allow": ["rss-summary/generate-digest"] }
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
      "id": "daily-rss-digest",
      "required": true,
      "schedule": "0 10 * * *",
      "templateId": "rss-summary/daily-digest",
      "timeZone": "Asia/Shanghai"
    }
  ]
}
```

The Automation input contains the exact scheduled ISO occurrence. The Tool converts it to `YYYY-MM-DD` using `FEED_TIMEZONE_OFFSET`, preventing a UTC occurrence from selecting the previous local day.

## Configure Sources

Set the existing `rss-summary` variables in the Rivus project's private `.env.local`. Use absolute paths because the daemon runs from the Rivus project, not this checkout:

```dotenv
FEED_TIMEZONE_OFFSET=+08:00
GITHUB_FEED_SOURCE=home
GITHUB_HOME_FETCH=conduit
GITHUB_HOME_STORAGE_STATE=/path/to/rss-summary/.state/github-home-storage.json
GITHUB_USERNAME=PerfectPan
RSS_FEEDS_FILE=/path/to/rss-summary/feeds.json
RIVUS_RSS_DIGEST_TARGET=replace-with-union-id
```

Do not set `NOTIFY_WEBHOOK_URL` for the Plugin path; Rivus owns delivery. GitHub tokens and browser storage remain local secrets and must not be committed.

## Verify

Validate both packages before activating the schedule:

```bash
cd /path/to/rss-summary
pnpm verify

cd /path/to/rivus-project
npm run doctor
npm run check-config
npm start
```

In the foreground run, invoke the `rss-digest` Agent with an explicit day and confirm the trace contains one `rss-summary/generate-digest` Tool call followed by the Markdown output. Only then enable the service manager and daily Automation.

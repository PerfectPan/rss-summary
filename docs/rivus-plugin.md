# Rivus Agent Plugin

`rss-summary/rivus-plugin` is an external Plugin for `@rivus/agent`. The Host owns scheduling, model execution, channel rendering, Feishu delivery, credentials, traces, and the delivery ledger. This package owns source collection, filtering, ranking, audit data, and presentation semantics.

Each Automation returns two compatible views of the same result: canonical Markdown remains the durable fallback, while `createPresentation` projects that Markdown into the channel-neutral Automation Presentation IR (`kind`, `title`, metadata, sections, items, notes, and source links). The adapter treats an explicit `来源：...` line as the semantic label for the preceding link rather than as a second item note, keeps collection labels out of event headlines, gives common providers readable badge labels, and collapses repeated provider badges per item. A modern Rivus Host renders the IR with native channel components; an older Host safely falls back to Markdown. The Plugin never emits CardKit JSON or chooses Feishu colors, spacing, buttons, or containers.

## Registered surface

| Kind | ID | Purpose |
| --- | --- | --- |
| Agent profile | `rss-digest` | Allows only the five rss-summary Tools |
| Tool | `rss-summary/generate-digest` | GitHub Home + explicitly subscribed personal RSS |
| Tool | `rss-summary/research-article` | read an article or research video transcripts and visual key frames |
| Tool | `rss-summary/generate-industry-brief` | curated official feeds and verified pages; papers stay pending |
| Tool | `rss-summary/generate-news-brief` | bounded noon/evening authoritative web news |
| Tool | `rss-summary/generate-daily-ai-digest` | two-phase grounded Daily AI evidence editing and rendering |
| Automation | `rss-summary/morning-feed-digest` | previous Asia/Shanghai calendar day's personal subscriptions |
| Automation | `rss-summary/daily-ai-digest` | rolling 24-hour Daily AI Digest ending at the occurrence |
| Automation | `rss-summary/daily-industry-brief` | current local calendar day's frontier updates |
| Automation | `rss-summary/noon-news-brief` | current day 00:00 through noon occurrence |
| Automation | `rss-summary/evening-news-brief` | current day 12:30 through evening occurrence |

All Tools have `observe` risk. Feed Tools force dry-run mode: they read only-new state but do not send a webhook, write seen state, or write local run artifacts. News collection also leaves business seen state and message delivery untouched, but it writes operational request reservations and raw response cache entries. Its result includes the query/rejection/selection audit. Daily AI combines official sources and subscribed X accounts without broad news search. Its `collect` result exposes all normalized evidence and compact source health/counts; full evidence and audit snapshots are saved locally for recovery. Its `render` result contains final Markdown, validation issues and the delivery receipt, without repeating evidence or candidate audits. Rivus records the subsequent card delivery in its trace and Feishu delivery ledger.

The official registry includes Anthropic News, Research and Engineering; Cursor Changelog and Blog;
alongside OpenAI RSS. xAI News remains excluded while its production fetch is blocked by HTTP 403.
HTTP or parser failures remain visible in source audit and the
Daily AI source-status warning; a configured page does not imply successful coverage. Cursor
changelog bodies are kept with their own article links so the editor can explain actual changes.

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

The `@rivus/agent` peer is `*`, without a version restriction. Repository tests use the exact
0.18.0 release; package checks also exercise the historical 0.12.7 baseline. Each deployed Core upgrade must still pass
Plugin conformance and no-send Tool checks.

The Plugin passes Promises and plain data to the Host. Its internal Effect 3 computations are completed
inside its application adapters before returning to the Host, so they remain separate from Core Effect 4.
Do not pass Effect or Stream values across this boundary.

`pnpm package:check` keeps the 0.12.7 baseline check by default. Test a newer exact official release from the
public npm registry without changing the development lockfile:

```bash
RIVUS_CORE_PACKAGE_VERSION=0.18.0 pnpm package:check
```

Version ranges and dist-tags are rejected. The registry version option cannot be combined with an archive.
The Plugin stays private and is installed from its independently maintained source; the Core runtime is installed
from its official npm release. Local archive checks remain available for development diagnostics:

```bash
RIVUS_CORE_PACKAGE_TGZ=/absolute/path/to/rivus-agent.tgz \
RIVUS_CORE_PACKAGE_SHA256=<sha256-of-that-archive> \
pnpm package:check
```

The package check verifies the archive before installing it into an isolated consumer, then runs the same Plugin
conformance and packaged-source checks. The archive path and digest are inputs only; they are never written into the
package or repository state.

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

Add Automation instances referencing the templates above. Morning subscriptions resolves the previous local day, while Daily AI resolves the exact rolling 24 hours before its occurrence; they remain independently scheduled and delivered. Industry uses the current local day; standalone noon/evening news uses non-overlapping windows. On modern Hosts, Rivus renders the Plugin-owned Automation Presentation IR; the first Markdown heading remains the legacy card-header fallback.

## Configure sources

Use absolute paths for project-owned mutable state and source overrides in the Rivus project's private
environment. `INDUSTRY_SOURCES_FILE` is optional: when omitted, the Plugin loads its packaged
`industry-feeds.json` independently of the daemon working directory. When set, the file must exist.

```dotenv
FEED_TIMEZONE_OFFSET=+08:00
GITHUB_FEED_SOURCE=home
GITHUB_HOME_FETCH=conduit
GITHUB_HOME_STORAGE_STATE=/path/to/rss-summary/.state/github-home-storage.json
GITHUB_USERNAME=PerfectPan
RSS_FEEDS_FILE=/path/to/rss-summary/feeds.json
FEED_STATE_FILE=/path/to/rss-summary/.state/feed-state.json
# Optional override; omit to use the registry packaged with rss-summary.
# INDUSTRY_SOURCES_FILE=/path/to/rss-summary/industry-feeds.json
INDUSTRY_STATE_FILE=/path/to/rss-summary/.state/industry-state.json
FEED_MAX_PAPERS=8
NEWS_SEARCH_MODE=grok
# For explicit doubao/hybrid/combined mode only:
# DOUBAO_SEARCH_API_KEY=replace-with-doubao-search-api-key
NEWS_TOPICS_FILE=/path/to/rss-summary/news-topics.json
NEWS_SEARCH_STATE_FILE=/path/to/persistent-state/news-search.json
GH_FEED_TOKEN=replace-with-github-token
RIVUS_RSS_DIGEST_TARGET=replace-with-union-id
```

Do not set `NOTIFY_WEBHOOK_URL` for the Plugin path; Rivus owns delivery. Browser storage, API keys, and tokens remain local secrets.

Keep `NEWS_SEARCH_STATE_FILE` outside replaceable package directories and use the same persistent file
for Daily AI, standalone news and CLI callers in this deployment. Before enabling the new budget,
carry forward observed current-month usage rather than starting an empty ledger. Query caps, limits,
cache behavior and recovery steps are defined in [News search budget](news-search-budget.md).

For articles, the subscription research Tool uses browser-first mode by default. On a Mac mini with Chrome installed, set
`RSS_ARTICLE_BROWSER_CHANNEL=chrome` (the default), keep `RSS_ARTICLE_BROWSER_HEADLESS=true` for daemon runs,
and optionally tune `RSS_ARTICLE_BROWSER_TIMEOUT_MS`. If the browser cannot render a page, the Tool falls back
to its bounded HTTP extractor; pass `mode:"browser"` to require browser research or `mode:"http"` to skip it.

The news Tool reads its mode, budgets and optional provider keys from the Node process environment. It defaults to Grok when `NEWS_SEARCH_MODE` is absent and requires an authenticated Grok CLI under the Host user. If the Rivus CLI's environment-file option only configures the Host, also load the file into Node:

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

The news Tool's `audit` records each structured query's provider log ID, normalized provider error code, result counts, deterministic rejection reasons (`outside-window`, `insufficient-authority`, `intent-mismatch`, and others), canonical/title deduplication, topic quota filtering, and the final brief cap. Query entries also expose request usage and the original fetch timestamp when served from the raw search cache; deferred queries, exhausted budgets and cached coverage appear in source-status warnings. Selected stories also expose a score breakdown for query rank, authority, freshness, and the bounded cross-query tie-break.

The subscriptions Tool uses a bounded three-phase contract in scheduled runs. `collect` returns typed evidence and deterministic repository facts. The profile model must then make a second-pass decision for every evidence item through `select`, with a short reason; ordinary star/watch activity, duplicates, low-information changes, title-only changes, and items without a user-relevant value should be rejected. For selected public URLs, the Agent calls `rss-summary/research-article` with `mode:"auto"`; the Tool reads article pages through the browser/HTTP flow, or routes known video URLs through Summarize for captions and audio transcription. Video results use `method: captions|transcription`, retain the original URL, and reject description-only results. The research Tool also extracts at most six key frames and sends each PNG to an image-capable model through Summarize. It defaults to the authenticated Codex CLI; RSS_VIDEO_VISION_CLI selects another CLI, and RSS_VIDEO_VISION_MODEL takes precedence when set. Each frame keeps its timestamp, optional OCR, completed visual observation and model identifier. Only completed visual observations enter the bounded content alongside the transcript. OCR or a file path alone is never considered visual inspection. visuals.status reports analyzed, partial or unavailable, so a failed image pass remains distinguishable from transcript success. This runs inside the research Tool because Rivus scheduled invocations do not grant native read access. Long transcripts are returned as explicitly labelled excerpts distributed across the full text; only the returned evidence may support the final summary. Install Summarize 0.25.1, yt-dlp, ffmpeg, whisper-cpp and a local Whisper model on the actual scheduler host as described in the README. Direct media downloads are capped at 1 GB, transcript and visual stages each at ten minutes, and each image-model call at two minutes. Temporary media is deleted after use; full transcripts, PNGs, OCR and visual observations persist under .state/video-research (RSS_VIDEO_RESEARCH_DIR overrides it), with materials paths returned for inspection. These artifacts are not delivery state and must not enter Git. The Agent passes the bounded body into `render` as research evidence. This research step improves only the selected item's grounded summary; the RSS/GitHub collection, selection, deduplication and delivery path stays the same. Summary wording follows the Daily AI Digest single-event style: subject, action, concrete change/result and impact, with a hard limit of 180 characters; sentence and clause punctuation remains model-owned. `render` accepts the complete selection plus research and `Array<{ref, summary}>`, filters the document to `selected=true`, validates references, numeric claims and the length limit, and returns Markdown. If a draft fails validation, it returns `SUBSCRIPTION_SUMMARY_VALIDATION_FAILED` so the Agent can regenerate the affected summary; it never silently substitutes RSS text. If the selection is empty, the profile returns `RIVUS_AUTOMATION_SUPPRESSED:` with a reason so Rivus records the run without creating a delivery. The frontier/news products do not pass through this subscription editor.

The Tool cannot honestly claim Feishu delivery because delivery happens after Tool execution. Use the Rivus run trace for the exact Tool result and its Feishu delivery ledger for target, attempt, idempotency, and outcome. Direct CLI runs instead write paired `.state/runs/...json` and `.md` artifacts.

## Verify

```bash
cd /path/to/rss-summary
pnpm verify

cd /path/to/rivus-project
npm run doctor
npm run check-config
```

Invoke each enabled template once in the foreground. Confirm the morning subscriptions trace contains `collect`, `select`, `research-article`, and `render` calls, every evidence item has an AI decision and reason, research results are URL-matched and bounded, repository rows retain deterministic stars/language facts, PR/RSS rows contain grounded summaries only when selected, and an empty selection is recorded as suppressed without a delivery. Confirm the separate Daily AI card covers `[occurrence - 24h, occurrence)`, invalid draft items do not remove valid siblings, the frontier trace lists only official `industry-feeds.json` sources (including `web-page` source health), standalone noon/evening windows do not overlap, the structured card keeps semantic source links inline with each item without right-side button columns or a duplicate source appendix, and the delivery ledger records the card outcome before enabling the service manager.


### Grok X search

Native X search is the default for the existing noon/evening news Tool
when `NEWS_SEARCH_MODE` is absent. Explicit `doubao`, `hybrid` and `combined` settings remain effective;
set `NEWS_SEARCH_MODE=grok` to change an existing Host to Grok. The host's OS user must
already have an authenticated Grok CLI. No Doubao or GLM key is needed in this mode;
Daily AI independently combines official RSS/websites with subscribed X accounts, defaulting to
`DAILY_AI_X_HANDLES=ClaudeDevs` (explicit empty disables X). It never calls the broad news Tool.
Account collection always uses Grok, shares the CLI settings and request ledger, and is reusable
with caller-owned windows. `sourceAudit.xAccounts` retains per-account results/failures, request
usage and possible retrieval saturation; X evidence remains unverified and labelled Grok-relayed.
Daily AI excludes arXiv and sources tagged `Papers` or `Academic` before fetching; official
research sources such as Anthropic Research and Google DeepMind remain enabled. This exclusion
does not change standalone industry collection or the shared feed configuration. Neither collect
evidence nor the final selection has a fixed item quota, and excerpts are not truncated.
Full collect/render snapshots are written atomically with private file permissions under
`$RIVUS_DEPLOYMENT_STATE_DIR/rss-summary/daily-ai` (fallback: `.state/daily-ai`), keyed by occurrence
and phase. They are operational diagnostics, not delivery state, and must not enter Git.
Daily AI render reuses collect evidence without another search. The obsolete
`DAILY_AI_NEWS_MAX_QUERIES` has no effect.
See [Grok X search](grok-x-search.md) for caps, usage interpretation and a no-send trial.
Changing these variables does not install the updated plugin or reload an existing host.

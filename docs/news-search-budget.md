# News search budget

Daily AI's X account subscriptions, noon news and evening news share one persistent request budget
and response cache. Daily AI combines official RSS/websites with selected X accounts and no longer
calls broad news search. Grok is the default news provider; explicit Doubao, hybrid and combined
modes remain supported. Account subscriptions always use Grok, independently of the news mode.
Changing providers preserves the ledger and existing schedules.

## Request plan and account allowance

With one subscribed account and default Grok news query caps, the nominal plan is one account
request plus one noon and one evening request: three CLI attempts per day before cache hits or
manual runs. Grok/account callers default to four attempts per day and 120 per month. Each extra
account needs another attempt. These are CLI attempts, not native X tool calls or dollar limits.

In explicit Doubao/hybrid/combined mode, standalone news selects at most four noon and four evening
queries. Daily AI adds no Doubao queries. Those news callers retain defaults of 14/420; deployments
mixing these modes with Grok account subscriptions should explicitly set the shared limits so all
callers enforce the same cap. News query IDs rotate; deferred queries remain visible in the audit.

The existing deployment's 09:10 Daily AI, 12:30 noon and 19:00 evening pushes do not need to move.
The query plan changes collection cost, not the scheduling or delivery identity.

The [official personal search allowance](https://docs.volcengine.com/docs/ark/agent-plan-personal-search?lang=zh)
is 500 requests per main account per month, shared by applications and reset on the first day of the
month. `500 / 30` is about 16.67 requests per day; the non-Grok news caller defaults remain 14 daily and 420 monthly, independently of the lower scheduled query count. Fourteen requests for 31 days would be 434, so the monthly cap deliberately stops new requests
before that plan completes. Cache hits can reduce actual requests; failures, retries and extra manual
runs can use the cap earlier. Other applications can consume the same account allowance, so this
local cap does not guarantee that the account has free requests remaining.

The [official search API pricing](https://docs.volcengine.com/docs/87772/2272951) is ¥0.020 per API
request. `NEWS_SEARCH_COUNT_PER_QUERY` controls returned result count; it does not turn a larger
response into multiple search requests or reduce requests by returning fewer results. Whether a
failed provider request is billed was not established from the official documentation. The local
ledger conservatively counts every reserved attempt, including failed attempts and retries.

## Configuration

| Variable | Default | Accepted values | Purpose |
| --- | --- | --- | --- |
| `NEWS_SEARCH_MAX_QUERIES` | `4` | integer `1..32` | Maximum configured query IDs selected for each standalone noon/evening run |
| `NEWS_SEARCH_DAILY_LIMIT` | Grok `4`; other modes `14` | integer `0..100000` | Shared new-request attempt cap for the current local calendar day |
| `NEWS_SEARCH_MONTHLY_LIMIT` | Grok `120`; other modes `420` | integer `0..1000000` | Shared new-request attempt cap for the current local calendar month |
| `NEWS_SEARCH_CACHE_TTL_MINUTES` | `360` | integer `0..43200` | Search page cache lifetime; `0` disables reuse |
| `NEWS_SEARCH_STATE_FILE` | `.state/news-search.json` | nonempty path | Budget ledger and raw response cache; deployment must set a persistent absolute path |
| `FEED_TIMEZONE_OFFSET` | `+08:00` for news | supported fixed offset | Calendar boundary for request accounting |
| `NEWS_SEARCH_FALLBACK` | unset | `deepseek` | Enable the DeepSeek news fallback described below; any other value fails the run |
| `DEEPSEEK_API_KEY` | unset | nonempty string | Required when `NEWS_SEARCH_FALLBACK=deepseek` |
| `DEEPSEEK_SEARCH_BASE_URL` | `https://api.deepseek.com/v1/tools/search` | HTTP(S) URL | Endpoint override; the normalized URL is the fallback's provider identity |
| `DEEPSEEK_SEARCH_TIMEOUT_MS` | `15000` | integer `1000..60000` | DeepSeek request timeout |
| `DEEPSEEK_SEARCH_DAILY_LIMIT` | `14` | integer `0..100000` | Attempt cap the DeepSeek caller enforces over the shared ledger for the current local day |
| `DEEPSEEK_SEARCH_MONTHLY_LIMIT` | `420` | integer `0..1000000` | Attempt cap the DeepSeek caller enforces over the shared ledger for the current local month |

Grok further limits standalone news query plans with `NEWS_GROK_MAX_QUERIES=1` (range `1..4`). Query caps are
bounded by the number of enabled configured queries. `DAILY_AI_NEWS_MAX_QUERIES` is obsolete.
Account retrieval uses `DAILY_AI_X_HANDLES` and `X_ACCOUNT_POSTS_PER_FETCH`; see [X collection](grok-x-search.md). A zero daily or monthly limit
blocks new provider requests; an eligible cache entry may still be read. The caps constrain attempts,
so a retry can consume another slot without completing another query.

Set these values in the Node process environment used by the CLI or Rivus Host, as described in
[Rivus Plugin configuration](rivus-plugin.md#configure-sources). Use one state file for callers sharing
this deployment's budget. Separate ledgers for its Daily AI, noon and evening jobs would split the
cap. The state file is distinct from subscription/frontier seen state and is never committed or
included in the package.

## Reservation and failure behavior

The budgeted search wrapper (`withBudget` in `src/acquisition/application/services/with-budget.ts`, state in
`src/acquisition/infra/repository/search-budget-file.ts`) wraps the selected Doubao or Grok client. Under a short cross-process
file lock it loads and validates state, checks the cache, checks both caps, and atomically persists
one reserved attempt before the provider request starts. The provider runs outside the lock. A reservation is
not refunded if the request fails, the process exits, or the successful response cannot be cached.
Retries pass through the same wrapper and reserve again. Concurrent identical requests in one
run (one Effect fiber tree) share a pending operation; separate runs and different processes still reserve
independently on a cache miss.

Accounting uses the real current clock plus `FEED_TIMEZONE_OFFSET`, not a requested historical
occurrence. Running a historical digest today therefore consumes today's allowance. Monthly usage
is the sum of persisted daily counters in the current local month; changing the occurrence or
restarting the daemon does not reset it. Earlier daily counters are retained.

Invalid state, a timezone mismatch, unreadable/unwritable storage or a lock failure stops new search
requests. The adapter never silently replaces corrupt state, resets counters or removes an existing
lock. Normal owners release their lock after the state operation. `local_budget_exhausted` and
`local_budget_state` do not activate GLM fallback in hybrid/combined mode; a local spending boundary
must not cause spending at another provider. Deferred query IDs also make no provider request.
Provider/network failures keep their existing degradation and retry handling. An exhausted local
budget is audited as skipped coverage, not evidence that no news was published.
After a provider-quota circuit opens, later queries still check local state and eligible cache
without reserving another request or contacting Doubao; the circuit cannot bypass a local cap.

## Raw cache and coverage

Raw Doubao responses and validated Grok search pages are cached, including successful responses with zero results. GLM results,
hybrid compositions and editorial outputs are not stored in this cache. Cache identity includes the
actual outgoing query text, requested result count, provider endpoint, source policy and calendar
date range. A fresh entry can satisfy a narrower date range it already covers only when the other
request fields match. The application still filters publication timestamps against the exact
requested window and applies the current relevance, authority and deduplication rules. Account cache
keys additionally encode the exact start/end instants and normalized handle, so an advancing window
cannot reuse a prior snapshot. Account failures and saturation are retained in `sourceAudit.xAccounts`.

The six-hour default trades freshness for fewer requests. It is not a lossless optimization:
newly published or newly indexed stories can be absent until the next network fetch. Audit entries
retain `searchUsage.source`, the original `fetchedAt` timestamp, and the local usage/limit snapshot.
Source status is `partial` when cached evidence is reused, with a visible freshness note. A cache
hit does not activate GLM fallback or complementary search, even if the cached page is empty or all
its results fail the exact-window filter. A cached empty response is not proof that there have been
no updates since its fetch time.

News Tools remain observational with respect to business state and delivery: they do not write
business seen state or send messages. Their collection phase does write these operational budget
and cache records. Daily AI's in-process evidence snapshot used by `render` is separate from this
persistent raw search cache.

## Deployment and recovery

Before restarting a deployment with these limits:

1. Stop its scheduled and manual news callers while preparing the shared state file. Keep the push
   schedules and Automation IDs unchanged.
2. Set `NEWS_SEARCH_STATE_FILE` to an absolute path in private persistent storage outside package
   installs and release directories. Give all intended callers access to that same file and ensure
   its directory supports file creation, exclusive locks, atomic rename and syncing.
3. Carry forward verified current-month usage from the old deployment. State version `1` has
   `timezoneOffset`, a `daily` map of `YYYY-MM-DD` to nonnegative attempt counts, and a `cache` map.
   Initialize each known day's observed attempts in `daily`, with the configured timezone;
   `cache` may start empty. Do not deploy an empty `daily` map as an upgrade or erase already-used
   allowance. Record the evidence and assumptions privately.
4. Distinguish observed scheduled attempts from unknown failed attempts, retries and other
   applications' account consumption. The historical 35-request plan is not proof of actual account
   usage. If current-month usage is already at or above the local cap, keep new searches blocked;
   do not clear the ledger to make the next run succeed. When account usage cannot be established,
   report that uncertainty and use a conservative remaining allowance, including zero if needed.
5. Prefer isolated mocked-provider tests for deployment validation. If a live no-send collection
   check is needed, account for it within the remaining allowance. Confirm the audit shows
   the selected/deferred queries, usage and cache timestamp, and that independent official sources
   still work. A no-send check can reserve attempts and update cache; it is not a filesystem-read-only
   or free validation. Verify that the package contains this guide without bundling private state.

To recover from state or lock errors, stop all callers first and preserve the state and lock for
inspection. Remove a lock manually only after confirming no process still owns the operation.
Restore a validated backup and add any verified attempts made after that backup; never reset the
ledger to zero as a repair. If counts cannot be reconstructed reliably, leave search blocked and
report the missing accounting evidence. A timezone change also requires a deliberate stopped-state
migration; it must not silently reinterpret or discard earlier counters. Resume only after the
state, timezone and persistent path have been checked.


## Grok mode

`NEWS_SEARCH_MODE=grok` uses the same ledger and locking rules. Its defaults are 4 attempts/day
and 120/month, with a separate `NEWS_GROK_MAX_QUERIES=1` per-run cap that also bounds Daily AI's
query override. Explicit common budget variables take precedence. Modes sharing one state file
share counters; cache identities remain separate (`grok://cli/v1/<model>` versus HTTP endpoint).
Existing version-1 Doubao state is accepted without resetting its counters. Once Grok cache entries
have been written, older releases without Grok support cannot read those entries; preserve the
ledger and remove only Grok cache entries while callers are stopped if a rollback is required.

One reserved Grok attempt is one CLI process, not one underlying X tool call, token or dollar.
A process can perform multiple X searches within its two-turn limit. There is no automatic retry
or paid fallback after a Grok failure. Cached `grok.costUsd` and token fields describe the original
fetch; do not count them as new spending when `searchUsage.source=cache`.
See [Grok X search](grok-x-search.md) for authentication and evidence limitations.

## DeepSeek news fallback

`NEWS_SEARCH_FALLBACK=deepseek` (any other value fails the run; unset keeps the
previous behavior exactly) wraps only the noon/evening primary search — Doubao,
Grok, hybrid and combined modes alike. The Daily AI X collection never falls
back because the DeepSeek endpoint cannot search posts by author.

The fallback activates only for source outages: timeouts, `http_429` that still
fails after `withRetry`, HTTP 5xx, `network_error`, `invalid_response`, every
Grok CLI failure code and Doubao's `10406` quota error. `local_budget_exhausted`,
`local_budget_state`, `query_deferred` and non-search program errors never fall
back — a local spending boundary must not quietly spend another provider's
allowance. Official-policy topics never fall back either: DeepSeek serves only
`news` and `authoritative` queries, so the primary failure stands. In hybrid and
combined modes a failing primary first retries on DeepSeek; only when DeepSeek
also fails does the existing GLM complement run, and the error it reacts to is
the primary's. When DeepSeek itself fails, the primary failure is what the audit
and downstream degradation see, because the primary is the configured source.

The fallback provider carries its own caps (`DEEPSEEK_SEARCH_DAILY_LIMIT`,
default 14, and `DEEPSEEK_SEARCH_MONTHLY_LIMIT`, default 420) but shares the
`NEWS_SEARCH_*` state file and its single daily/monthly counters with every
other caller; each caller enforces its own limit against that shared ledger, so
the effective combined cap is the lowest limit any active caller checks. The
endpoint URL is the provider identity, keeping DeepSeek cache entries separate
from Doubao's and Grok's in the same cache map.

DeepSeek Search bills $0.75 per 1,000 successful requests ([pricing](https://api-docs.deepseek.com/guides/search/));
the API does not bill failed requests, empty results or timeouts, but the local
ledger conservatively counts every reserved attempt, including fallback
attempts. The endpoint has no time-range parameter, so every DeepSeek result is
re-checked against the exact publication window by the normal funnel; the
source-status note on each brief states this. Successful fallback pages enter
the per-query audit with `provider: "deepseek"` and
`providerFallback.triggeredBy`, the primary error code that caused the switch.

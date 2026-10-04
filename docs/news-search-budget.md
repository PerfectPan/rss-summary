# News search budget

Daily AI, noon news and evening news share one persistent Doubao request budget and raw-response
cache. This lowers scheduled search traffic while preserving the existing push schedules, exact
publication windows, official-source collection and editorial validation.

## Request plan and account allowance

The previous daily plan executed seven queries for each of three overlapping Daily AI segments,
then seven queries for noon and seven for evening: `3 × 7 + 7 + 7 = 35` requests before retries.
Daily AI now queries its complete rolling 24-hour window once. The default plan is at most six Daily
AI queries plus four noon and four evening queries: `6 + 4 + 4 = 14` before cache hits and retries.
Query IDs rotate using the existing local-day/edition rotation, so the cap does not permanently
select only the first configured queries. Deferred queries remain in the audit; reduced coverage is
visible rather than reported as a complete search.

The existing deployment's 09:10 Daily AI, 12:30 noon and 19:00 evening pushes do not need to move.
The query plan changes collection cost, not the scheduling or delivery identity.

The [official personal search allowance](https://docs.volcengine.com/docs/ark/agent-plan-personal-search?lang=zh)
is 500 requests per main account per month, shared by applications and reset on the first day of the
month. `500 / 30` is about 16.67 requests per day; the default plan uses 14 and the local monthly cap
is 420. Fourteen requests for 31 days would be 434, so the monthly cap deliberately stops new requests
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
| `DAILY_AI_NEWS_MAX_QUERIES` | `6` | integer `1..32` | Maximum configured query IDs selected for one complete Daily AI window |
| `NEWS_SEARCH_MAX_QUERIES` | `4` | integer `1..32` | Maximum configured query IDs selected for each standalone noon/evening run |
| `NEWS_SEARCH_DAILY_LIMIT` | `14` | integer `0..100000` | Shared new-request attempt cap for the current local calendar day |
| `NEWS_SEARCH_MONTHLY_LIMIT` | `420` | integer `0..1000000` | Shared new-request attempt cap for the current local calendar month |
| `NEWS_SEARCH_CACHE_TTL_MINUTES` | `360` | integer `0..43200` | Raw Doubao cache lifetime; `0` disables reuse |
| `NEWS_SEARCH_STATE_FILE` | `.state/news-search.json` | nonempty path | Budget ledger and raw response cache; deployment must set a persistent absolute path |
| `FEED_TIMEZONE_OFFSET` | `+08:00` for news | supported fixed offset | Calendar boundary for request accounting |

Query caps are bounded by the number of enabled configured queries. A zero daily or monthly limit
blocks new Doubao requests; an eligible cache entry may still be read. The caps constrain attempts,
so a retry can consume another slot without completing another query.

Set these values in the Node process environment used by the CLI or Rivus Host, as described in
[Rivus Plugin configuration](rivus-plugin.md#configure-sources). Use one state file for callers sharing
this deployment's budget. Separate ledgers for its Daily AI, noon and evening jobs would split the
cap. The state file is distinct from subscription/frontier seen state and is never committed or
included in the package.

## Reservation and failure behavior

`src/infrastructure/doubao-search-budget.ts` wraps the raw Doubao client. Under a short cross-process
file lock it loads and validates state, checks the cache, checks both caps, and atomically persists
one reserved attempt before the HTTP request starts. HTTP runs outside the lock. A reservation is
not refunded if the request fails, the process exits, or the successful response cannot be cached.
Retries pass through the same wrapper and reserve again. Concurrent identical requests in one
process share a pending operation; different processes still reserve independently on a cache miss.

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

Only raw Doubao responses are cached, including successful responses with zero results. GLM results,
hybrid compositions and editorial outputs are not stored in this cache. Cache identity includes the
actual outgoing query text, requested result count, provider endpoint, source policy and calendar
date range. A fresh entry can satisfy a narrower date range it already covers only when the other
request fields match. The application still filters publication timestamps against the exact
requested window and applies the current relevance, authority and deduplication rules.

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

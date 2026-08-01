# Architecture

`rss-summary` is a local TypeScript CLI, a small set of portable Codex skills, and an external Rivus Plugin. It is not a daemon or hosted service. Scheduling is handled outside the repo by cron, launchd, systemd, Codex automation, or a Rivus deployment daemon.

The runtime goal is simple: produce a previous-day technical subscription digest from GitHub Home and RSS, plus bounded noon/evening headline briefs from authoritative web search, plus a once-per-day high-signal brief (高信号速览) from public GitHub Search, Hacker News, and official-domain search. Collection and ranking stay independent from Rivus scheduling and Feishu delivery.

## High-Level Flow

```mermaid
flowchart TD
  Trigger["cron / launchd / Codex skill"] --> CLI["rss-summary bin"]
  RivusSchedule["Rivus Automation"] --> Plugin["src/presentation/rivus-plugin.ts"]
  Plugin --> FeedAdapter["src/presentation/rivus-digest.ts feed adapter"]
  Plugin --> NewsBrief["src/application/news-brief.ts news application service"]
  FeedAdapter --> Digest
  CLI --> Digest["src/application/digest.ts digest workflow"]
  CLI --> FeedsCommand["src/presentation/feeds-cli.ts feed management"]

  Config["src/infrastructure/config.ts env + args + feeds.json"] --> Digest
  Digest --> GitHubHome["src/infrastructure/github-home.ts GitHub Home"]
  Digest --> GitHub["src/infrastructure/github.ts GitHub API fallback + enrichment"]
  Digest --> RSS["src/infrastructure/rss.ts RSS / Atom"]

  GitHubHome --> Cards["ActivityCard[]"]
  GitHub --> Cards
  RSS --> Cards
  Cards --> Window["src/domain/time.ts time window"]
  Window --> Domain["src/domain/digest.ts score + group"]

  State["src/infrastructure/state.ts .state/feed-state.json"] --> Digest
  Domain --> Render["src/presentation/render.ts Markdown / JSON"]
  Render --> Notify["src/infrastructure/notifier.ts stdout / webhook"]

  Topics["news-topics.json"] --> NewsBrief
  NewsBrief --> Doubao["src/infrastructure/doubao-search.ts Doubao web search"]
  Doubao --> NewsDomain["src/domain/news.ts validate + dedupe + rank"]
  NewsDomain --> NewsRender["src/presentation/news-render.ts mobile Markdown"]

  SignalSources["signal-sources.json"] --> SignalBrief["src/application/signal-brief.ts signal application service"]
  SignalBrief --> HackerNews["src/infrastructure/hacker-news.ts HN Algolia"]
  SignalBrief --> GithubSearch["src/infrastructure/github-search.ts GitHub Search API"]
  SignalBrief --> Doubao
  SignalBrief --> SignalDomain["src/domain/signal.ts filter + score + quotas"]
  SignalDomain --> SignalRender["src/presentation/signal-render.ts two-section Markdown"]

  FeedsCommand --> FeedStore["src/infrastructure/feed-store.ts feeds.json"]
```

## Runtime Boundaries

The source tree is organized into four layers (domain → application → infrastructure → presentation). Dependencies point inward: domain has no IO and imports nothing outside `domain/`; application composes use cases over ports and adapters; presentation owns entrypoints (CLI, Rivus Plugin) and rendering.

- **Domain** (`src/domain/`): pure rules and models, zero IO, no Effect. `digest.ts` normalizes GitHub events and ranks `CandidateProject` records; `news.ts` validates time/source authority, canonicalizes URLs, merges duplicate hits, and applies topic quotas; `signal.ts` filters and scores updates and repos, collapses duplicate events, and applies signal quotas with soft model/product balance; `time.ts` owns calendar-day and rolling windows; `text.ts` is the shared text/URL kernel (canonicalization, publish-time parsing, summary compaction, same-event collapse).
- **Application** (`src/application/`): use cases return `Effect<Result, Error>` (`Effect.gen` + `Effect.tryPromise` at port boundaries via `src/application/effect.ts`). `digest.ts` owns collection/enrichment/state orchestration; `news-brief.ts` defines noon/evening windows and fans out bounded queries; `signal-brief.ts` resolves the daily window and fans out to the three public sources. Use cases accept injectable port functions (deps objects) and default to real adapters.
- **Infrastructure** (`src/infrastructure/`): adapters and IO. `github-home.ts`, `github.ts`, `rss.ts`, `doubao-search.ts`, `hacker-news.ts`, `github-search.ts` are source clients; `config.ts` reads env/args/`feeds.json`; `news-topics.ts` and `signal-sources.ts` load and validate the tracked JSON policies; `state.ts`, `feed-store.ts`, `notifier.ts` persist/notify; `parsing.ts` holds shared validation/JSON helpers.
- **Presentation** (`src/presentation/`): entrypoints and output. `cli.ts` routes `rss-summary digest|feeds|github-home|signal`; `rivus-plugin.ts` registers one profile, three observe-only Tools, and four Automation templates; `rivus-digest.ts`, `feeds-cli.ts`, `signal-cli.ts`, `github-home-cli.ts` are thin command adapters; `render.ts`, `news-render.ts`, `signal-render.ts` format Markdown/JSON over the shared `markdown.ts` helpers. Presentation owns the `Effect.runPromise` boundary.

Side-effect management: application and presentation use `effect` (Effect 3). Domain stays framework-free, so every rule is directly unit-testable. The `attempt` helper (`src/application/effect.ts`) lifts promise-returning ports into the typed `Error` channel; entrypoints run effects with `Effect.runPromise`.

- Source adapters: `src/infrastructure/github-home.ts`, `github.ts`, and `rss.ts` feed the technical digest. `src/infrastructure/doubao-search.ts` is the bounded web-news adapter; it requests an exact calendar day, query rewrite, URLs, and the required source-authority level.
- Local persistence: `src/infrastructure/feed-store.ts` manages RSS subscriptions. `src/infrastructure/state.ts` manages local digest state.
- Rivus boundary: `src/presentation/rivus-plugin.ts` registers one profile, three observe-only Tools, and the morning/noon/evening/signal templates. `src/presentation/rivus-digest.ts`, `src/application/news-brief.ts`, and `src/application/signal-brief.ts` validate Tool input and call their application workflows; neither owns scheduling or Feishu delivery.
- Skills: `skills/*` describe how Codex should configure, run, research, or manage feeds using this repo.

## Domain Model

`ActivityCard` is the normalized input unit. GitHub events and RSS items both become activity cards with a source, actor, repository-like identifier, timestamp, title, summary, and link fields.

`CandidateProject` is the ranked output unit. It groups related cards by repository or article identity, records actors and event types, assigns a category, and explains why the item is worth attention.

Current candidate categories:

- `discovery`: stars, forks, newly created repositories, trending repositories, recommendations, and follows.
- `activity`: pull request activity and other project movement.
- `release`: release events.
- `article`: RSS/Atom items.

Current high-signal event types:

- GitHub Home rendered cards as `pull_request`, `fork`, `create`, `watch`, `trending`, `recommendation`, `follow`, `announcement`, or `release`.
- GitHub `WatchEvent` as `watch`.
- GitHub `PullRequestEvent` as `pull_request`.
- GitHub `ReleaseEvent` as `release`.
- GitHub `ForkEvent` as `fork`.
- GitHub repository `CreateEvent` as `create`.
- RSS/Atom entries as `article`.

## Digest Workflow

`rss-summary digest` currently runs this sequence:

1. `src/infrastructure/config.ts` reads environment variables, CLI flags, optional `feeds.json`, and default interests.
2. `src/application/digest.ts` fetches GitHub Home cards and RSS/Atom feeds in parallel. If `GITHUB_HOME_FETCH=conduit`, it directly fetches `/conduit/for_you_feed?requested_from_filter_event=true` with the saved web session and falls back to rendered browser parsing. If `GITHUB_FEED_SOURCE=events`, it fetches REST `received_events` instead. If `--rss-only` or `FEED_RSS_ONLY=true` is set, GitHub fetching is skipped.
3. `src/domain/time.ts` filters events by either an explicit calendar day or a rolling hour window.
4. `src/infrastructure/github.ts` optionally fetches followed accounts, repository metadata, and up to 20 pull request details.
5. `src/domain/digest.ts` builds ranked `CandidateProject` records from normalized events.
6. `src/infrastructure/state.ts` filters previously seen event IDs when `--only-new` is set.
7. `src/presentation/render.ts` emits Markdown or JSON.
8. `src/infrastructure/notifier.ts` writes to stdout and optionally sends `{ "text": markdown }` to `NOTIFY_WEBHOOK_URL`.
9. If `--only-new` is set and the run is not `--dry-run`, `.state/feed-state.json` is updated with seen event IDs.

`buildDigestDocument` exposes steps 1–6 as a delivery-free application boundary. The CLI renders and delivers the returned document, while the Rivus adapter renders it as Markdown and forces dry-run mode. Rivus `0.3.x` promotes the first Markdown heading into a proactive Feishu card header and owns the card delivery. Both entrypoints therefore share one collection and ranking implementation without importing Feishu concerns into this repository.

For scheduled daily summaries, prefer explicit calendar-day mode:

```bash
FEED_DAY="$(TZ=Asia/Shanghai date +%F)" rss-summary digest --only-new
```

Without `FEED_DAY` or `--day`, the CLI uses the compatibility rolling window from `FEED_WINDOW_HOURS`, defaulting to 36 hours.

## Signal Brief Workflow

`rss-summary signal` (or the Rivus Tool `rss-summary/generate-signal-brief`) answers “what shipped or rose in public AI×dev today”:

1. `src/infrastructure/signal-sources.ts` loads `signal-sources.json`; env overrides: `SIGNAL_SOURCES_FILE`, `SIGNAL_SEARCH_TIMEOUT_MS`.
2. `src/application/signal-brief.ts` resolves the local calendar day (from `occurrence` or explicit `day`) and fans out in parallel:
   - Doubao official search (`sourcePolicy: "official"`, one query per configured intent, kind `model` or `product`),
   - Hacker News Algolia (`search_by_date`, `points>minPoints`, optional `show_hn` tag), filtered to the day and re-ranked by points,
   - GitHub Repository Search (`created:>=`, `stars:>`, free-text keyword `OR`), sorted by stars.
3. `src/domain/signal.ts` rechecks publication windows, canonicalizes URLs, collapses the same event across publishers, scores deterministically (official-domain, HN points, frontend keywords, recency, cross-source agreement for updates; stars, newness, language/topic match, description/language penalties for repos), and applies quotas (`maxTotal` 8, `updates` 5 with soft model/product balance, `opensource` 4).
4. `src/presentation/signal-render.ts` emits `# 高信号速览 · YYYY-MM-DD` with two optional sections and omits empty ones.

There is no persistent `.state` for signal briefs; dedupe is in-run only. The CLI is inherently dry-run (read-only, no webhook).

## Feed Management Workflow

RSS/Atom sources are maintained in the tracked `feeds.json` file. The CLI manages that shared subscription list through `src/presentation/feeds-cli.ts` and `src/infrastructure/feed-store.ts`:

```bash
rss-summary feeds add --url "https://example.com/feed.xml" --name "Example" --tags "ai,agent"
rss-summary feeds list
rss-summary feeds test
rss-summary feeds remove --url "https://example.com/feed.xml"
```

Commit intentional `feeds.json` changes through the pull request workflow. The digest command always uses the tracked `feeds.json` as its RSS source list.

## Research Workflow

Deep research is currently a Codex skill workflow, not a deterministic CLI subcommand.

The CLI can emit machine-readable candidates:

```bash
rss-summary digest --json --only-new --dry-run
```

`skills/feed-research-digest` consumes those candidates and instructs Codex to inspect the relevant repository, PR, release, README, docs, or article page before deciding whether an item is worth attention.

The state file already has a `researched` field, but the CLI does not yet write or filter by it. Today, `--only-new` tracks seen event IDs. A future research-cache feature should wire `state.researched` into the research workflow so previously researched repositories/articles are skipped or summarized differently.

## GitHub Identity And Visibility

The machine identity does not control GitHub visibility. In exact Home mode, the saved GitHub web session identity does. In REST fallback mode, the token identity does.

- `GITHUB_FEED_SOURCE=home` uses `.state/github-home-storage.json` and reads the same Home feed cards the account sees in the browser.
- `GITHUB_HOME_FETCH=conduit` is the default Home fetch mode. It parses GitHub's internal conduit HTML response and automatically falls back to browser-rendered parsing when the internal request is unavailable.
- `rss-summary github-home login` creates or refreshes that storage state. Do this once on each scheduled machine.
- `GITHUB_FEED_SOURCE=events` uses `received_events`; a token created by `PerfectPan` can see `PerfectPan` received events that the token is allowed to read, while another account only sees public received events for `PerfectPan`.

Keep `GH_FEED_TOKEN`, `.env`, and `.state/` out of git. `feeds.json` is intentionally tracked as the shared RSS subscription list.

## Extension Points

- Add a new source: create an adapter that returns `ActivityCard[]`, then wire it into `src/application/digest.ts` before the event-window filter.
- Add RSS-like source management: extend `src/infrastructure/feed-store.ts` and `src/presentation/feeds-cli.ts` if the source needs local subscriptions.
- Tune usefulness: adjust interests, base scores, category rules, or reason generation in `src/domain/digest.ts`.
- Add deep research caching: connect `state.researched` to the research skill or add a dedicated CLI command that records research decisions.
- Add delivery channels: extend `src/infrastructure/notifier.ts` or add notifier adapters for Feishu, Slack, Telegram, email, or other targets.
- Add Rivus capabilities: register narrow Tools in `src/presentation/rivus-plugin.ts` and delegate them to application-level functions instead of copying source or ranking logic into the Plugin.
- Add content deduplication: cluster RSS/article candidates by canonical URL, title, or content fingerprint before scoring.
- Add signal sources (later tiers): Hugging Face, Product Hunt, or GitHub Trending HTML adapters feed `SignalRepoHit`-shaped candidates into `src/domain/signal.ts`.
- Add persistent signal state: introduce a `.state/signal-state.json` seen-set so repos/URLs are not re-pushed within N days; keep it behind an explicit flag.
- Deepen Effect adoption: replace deps-object injection with Effect `Context`/`Layer` services if the application boundary grows beyond three use cases.

## Current Gaps

- GitHub Home exact mode depends on GitHub's internal conduit endpoint, rendered DOM, and `data-hydro-view` card metadata, so it may need maintenance if github.com changes the Home page structure.
- Deep project/article research is skill-driven, not a built-in CLI command.
- `researched` state exists in the schema but is not yet used by the CLI.
- Webhook delivery is generic only.
- RSS deduplication is based on generated item IDs, not content similarity.
- This repository has no built-in daemon; a consuming Rivus deployment can host the exported Automation.

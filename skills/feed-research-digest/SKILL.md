---
name: feed-research-digest
description: Research and summarize newly fetched rss-summary candidates after GitHub received_events and RSS/Atom ingestion. Use when the user wants to further inspect daily new feed items, decide what is useful, avoid re-researching already seen items, or turn `rss-summary digest --json --only-new` output into an actionable project/article brief.
---

# Feed Research Digest

Use this skill after the local `rss-summary` project has fetched GitHub and RSS activity. The CLI decides what is new and high-signal; the reusable prompt decides what is worth attention.

Use `prompts/feed-research.md` as the model prompt. Use `docs/digest-delivery-research.md` as the architecture and delivery contract: research only selected candidates, produce a decision-oriented daily brief, and push only the final digest instead of raw events or raw candidate JSON.

## Daily Workflow

1. Locate the `rss-summary` project root containing `package.json`.
2. Preview new candidates without mutating state:

```bash
GH_FEED_TOKEN="..." GITHUB_USERNAME=PerfectPan FEED_DAY="$(TZ=Asia/Shanghai date +%F)" rss-summary digest --json --only-new --dry-run
```

3. If the JSON `candidates` array is empty, report that there are no new high-signal items.
4. Read `prompts/feed-research.md` and use it as the prompt body. Fill `CANDIDATES_JSON` with the dry-run JSON output and `FEED_STATE_JSON` with `.state/feed-state.json` when present.
5. Follow the prompt's research policy and output format. Do not replace it with an ad hoc summary.
6. After the user accepts or after a scheduled non-dry run, mark candidates seen with:

```bash
GH_FEED_TOKEN="..." GITHUB_USERNAME=PerfectPan FEED_DAY="$(TZ=Asia/Shanghai date +%F)" rss-summary digest --only-new
```

The non-dry run writes `.state/feed-state.json`. Do not commit `.state/`.

## Research Rules

- GitHub `discovery`: inspect repo README, description, topics, stars, recent activity, releases, and examples. Decide whether it helps the user's agent/tooling/frontend/Rust/TypeScript interests.
- GitHub `watch` / star: summarize the project, who starred it, what problem it solves, why it may matter, and whether to `try`, `track`, `save`, or `skip`. Do not say only "someone starred this repository".
- For star research dedupe, use repo identity rather than event identity: `github:owner/repo`. If `owner/repo` was researched before, do not inspect the README again unless the repo has materially changed; optionally mention "new star signal from X" in a short observation.
- GitHub `release`: inspect release notes and breaking changes. Summarize impact, upgrade risk, and whether action is needed.
- GitHub `activity`: inspect the PR title/body and repo context. Focus on merged PRs, repeated followed-actor signals, and trend indicators.
- For each merged PR that survives initial filtering, answer three questions before recommending it: what changed, whether the change deserves attention, and what the project is.
- Do not write `important PR merged` as the final reason. Replace it with a concrete reason such as "router API behavior changed", "agent write path hardened", "parser edge-case fixed", or "docs only; track but no action".
- RSS `article`: read the article page when available. Summarize the core claim, evidence, and practical relevance. Do not summarize only the feed snippet when the page is accessible.
- If the candidate is not useful after inspection, still record the skip reason so it does not appear as an unexplained omission.

### Code architecture and quality checks

For unknown GitHub `discovery` and `watch` / star repos, treat research as a lightweight code review instead of a README summary. Use GitHub files/API first; clone only when the visible repo surface is not enough to judge. Check:

- top-level tree and package/workspace files to understand product shape and repository boundaries.
- entrypoints such as `bin`, app/server files, library exports, examples, or extension/plugin manifests.
- dependency/runtime choices, especially whether they match the claimed problem and avoid unnecessary stacks.
- tests/CI, typechecking, linting, fixtures, or examples that prove the project can be trusted.
- recent commits, PRs, or releases to see whether the star followed active useful work or stale hype.
- code quality signals: cohesive modules, typed public APIs, clear error paths, small integration surfaces, docs that match code, and no obvious giant unrelated files or abandoned scaffolding.

Do not overclaim from shallow evidence. If you only inspected public metadata and key files, say the quality judgment is a surface-level impression. If the repo is already in `state.researched`, do not repeat this deep inspection unless there is a major release, large architectural rewrite, or long stale cache window.

## Output Style

Keep the output decision-oriented. For each recommended item include:

- Link and source.
- One-sentence gist.
- Why it matters to the user.
- Recommended action: `track`, `read`, `try`, `save`, or `skip`.

For star/discovery items, use this compact shape:

```text
### owner/repo — 建议动作
- 项目是什么：
- 今天为什么出现：
- 代码质量判断：
- 为什么值得你看：
- 建议动作：
```

For merged PR items, use a daily-briefing voice instead of implementation-log wording:

```text
### owner/repo — 建议动作
- 项目是什么：
- 今天发生了什么：
- 为什么值得你看：
- 建议动作：
```

Keep evidence checked in your working notes, not as a visible field in the final daily brief.
Avoid raw timelines. Avoid re-listing every candidate. The value is selection and judgment.

## State Semantics

- `--only-new --dry-run`: preview new candidates; does not update state.
- `--only-new`: outputs new candidates and records their event IDs in `.state/feed-state.json`.
- `--json`: emits the digest document as machine-readable JSON for this skill or other model pipelines.
- `FEED_DAY` or `--day`: filters to a calendar day; use this for scheduled daily summaries.
- `FEED_STATE_FILE`: overrides the default `.state/feed-state.json` path.
- `state.researched` is keyed by stable research identity. GitHub repo candidates use `github:owner/repo`, so repeated star events for the same repo do not trigger repeated deep research.

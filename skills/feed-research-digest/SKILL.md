---
name: feed-research-digest
description: Research and summarize newly fetched rss-summary candidates after GitHub received_events and RSS/Atom ingestion. Use when the user wants to further inspect daily new feed items, decide what is useful, avoid re-researching already seen items, or turn `rss-summary digest --json --only-new` output into an actionable project/article brief.
---

# Feed Research Digest

Use this skill after the local `rss-summary` project has fetched GitHub and RSS activity. The CLI decides what is new and high-signal; this skill decides what is worth attention.

Use `docs/digest-delivery-research.md` as the current summary and delivery contract: research only selected candidates, produce a decision-oriented daily brief, and push only the final digest instead of raw events or raw candidate JSON.

## Daily Workflow

1. Locate the `rss-summary` project root containing `package.json`.
2. Preview new candidates without mutating state:

```bash
GH_FEED_TOKEN="..." GITHUB_USERNAME=PerfectPan RSS_FEEDS_FILE=feeds.json FEED_DAY="$(TZ=Asia/Shanghai date +%F)" rss-summary digest --json --only-new --dry-run
```

3. Parse the JSON `candidates` array. If it is empty, report that there are no new high-signal items.
4. Research only the top candidates that are plausibly useful. Prefer 5 to 8 items unless the user asks for more. Do not stop at the feed snippet: open the repo, PR, release, README, docs, or article page needed to make a decision.
5. Produce a concise Markdown digest with:
   - `今日最值得看`: strongest items with why they matter.
   - `建议深挖`: items that need follow-up, install/test/read later.
   - `可以略过`: noisy or low-value items, with one-line reason.
   - `后续行动`: concrete next steps.
6. After the user accepts or after a scheduled non-dry run, mark candidates seen with:

```bash
GH_FEED_TOKEN="..." GITHUB_USERNAME=PerfectPan RSS_FEEDS_FILE=feeds.json FEED_DAY="$(TZ=Asia/Shanghai date +%F)" rss-summary digest --only-new
```

The non-dry run writes `.state/feed-state.json`. Do not commit `.state/`.

## Research Rules

- GitHub `discovery`: inspect repo README, description, topics, stars, recent activity, releases, and examples. Decide whether it helps the user's agent/tooling/frontend/Rust/TypeScript interests.
- GitHub `release`: inspect release notes and breaking changes. Summarize impact, upgrade risk, and whether action is needed.
- GitHub `activity`: inspect the PR title/body and repo context. Focus on merged PRs, repeated followed-actor signals, and trend indicators.
- For each merged PR that survives initial filtering, answer three questions before recommending it: what changed, whether the change deserves attention, and what the project is.
- Do not write `important PR merged` as the final reason. Replace it with a concrete reason such as "router API behavior changed", "agent write path hardened", "parser edge-case fixed", or "docs only; track but no action".
- RSS `article`: read the article page when available. Summarize the core claim, evidence, and practical relevance. Do not summarize only the feed snippet when the page is accessible.
- If the candidate is not useful after inspection, still record the skip reason so it does not appear as an unexplained omission.

## Output Style

Keep the output decision-oriented. For each recommended item include:

- Link and source.
- One-sentence gist.
- Evidence checked: README/release/PR/article and the concrete signal found there.
- Why it matters to the user.
- Recommended action: `track`, `read`, `try`, `save`, or `skip`.

For merged PR items, use a daily-briefing voice instead of implementation-log wording:

```text
### owner/repo — 建议动作
- 项目是什么：
- 今天发生了什么：
- 为什么值得你看：
- 建议动作：
- 依据：
```

Avoid raw timelines. Avoid re-listing every candidate. The value is selection and judgment.

## State Semantics

- `--only-new --dry-run`: preview new candidates; does not update state.
- `--only-new`: outputs new candidates and records their event IDs in `.state/feed-state.json`.
- `--json`: emits the digest document as machine-readable JSON for this skill or other model pipelines.
- `FEED_DAY` or `--day`: filters to a calendar day; use this for scheduled daily summaries.
- `FEED_STATE_FILE`: overrides the default `.state/feed-state.json` path.

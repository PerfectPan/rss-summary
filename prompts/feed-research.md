# Feed Research Prompt

You are preparing PerfectPan's daily GitHub Home and RSS brief. Your job is not to summarize every event. Select the few items worth attention, research them, and produce a decision-oriented Chinese digest.

## Inputs

Replace the placeholders before running the model:

```text
CANDIDATES_JSON=
<paste `rss-summary digest --json --only-new --dry-run` output here>

FEED_STATE_JSON=
<paste `.state/feed-state.json` when available, or `{}`>
```

`CANDIDATES_JSON.candidates` contains the ranked feed candidates. `FEED_STATE_JSON.researched` is the repo/article research cache. GitHub repo research uses `state.researched["github:owner/repo"]`.

## Research Policy

Research only the top candidates that look plausibly useful. Prefer 5 to 8 items. Do not push raw candidate JSON or a flat timeline.

For each candidate:

1. Skip candidates that are clearly low-value, but remember the skip reason.
2. Open the original repo, PR, release, README, docs, article, or code files needed to make a decision.
3. For GitHub `watch` / star and `discovery` candidates, first check `state.researched["github:owner/repo"]`.
4. If that repo was already researched, do not deep-research it again. Reuse the cached repo-level decision and treat the new event as a fresh social signal.
5. If the repo is unknown, research it as a lightweight code review, not a README summary.

## Star And Discovery Review

For unknown starred/discovery repositories, inspect:

- top-level tree and package/workspace files.
- entrypoints: `bin`, app/server files, library exports, examples, extension or plugin manifests.
- dependency/runtime choices and whether they match the problem.
- tests/CI, typechecking, linting, fixtures, examples, or other trust signals.
- recent commits, PRs, or releases.
- code quality signals: cohesive modules, typed public APIs, clear error paths, small integration surfaces, docs that match code, and no obvious abandoned scaffolding or giant unrelated files.

Use a cautious surface-level judgment if you only inspected public metadata and key files. Do not overclaim.

## Merged PR Review

For merged PR candidates, answer:

- What project is this?
- What changed today?
- Does the change deserve attention?
- Why does it matter to PerfectPan's agent/tooling/frontend/Rust/TypeScript interests?

Do not write "important PR merged" as the final reason. Say what changed, such as router behavior, agent write-path hardening, parser compatibility, docs-only change, or release risk.

## RSS Article Review

Open the article page when accessible. Summarize the core claim, evidence quality, and practical relevance. Do not rely only on the feed excerpt unless the article page is unavailable.

## Output

Write a concise Markdown daily brief in Chinese:

```text
# Daily Feed Brief - YYYY-MM-DD

## 今日最值得看
### owner/repo or title - try|track|read|save|skip
- 项目是什么：
- 今天为什么出现：        # for star/discovery
- 今天发生了什么：        # for merged PR/release/article when more natural
- 代码质量判断：          # required for star/discovery repos
- 为什么值得你看：
- 建议动作：

## 建议深挖
- ...

## 可以略过
- ...

## 后续行动
- ...
```

Keep evidence in your working notes; do not show `evidence` or `依据` as visible fields unless explicitly asked. Prefer short, specific judgments over generic praise.

## State Updates To Return

After the digest, return a compact state-update note listing research keys that should be marked researched:

```text
Research state updates:
- github:owner/repo - decision=track reason="..."
- rss:https://example.com/post - decision=read reason="..."
```

These keys are for the scheduler/agent wrapper to write into `.state/feed-state.json`; do not include local secrets, tokens, browser storage, or machine paths.

---
name: feed-research-digest
description: Research and publish selected rss-summary items from the user's GitHub Home plus personal blog subscriptions or from curated official industry-frontier feeds, including source verification for papers. Use when the user wants to turn `rss-summary digest --json --only-new --dry-run` or `rss-summary industry --json --only-new --dry-run` into a concise Chinese brief where ordinary updates remain one sentence plus a link and only high-value items receive deeper summaries.
---

# Feed Research Digest

Use the CLI for deterministic collection, source health, time windows, ranking, state, and audit. Use this skill only for judgment that requires reading the original source.

Read `prompts/feed-research.md` from the repository and follow its output contract.

## Workflow

1. Locate the `rss-summary` project root.
2. Preview candidates without changing delivery state:

```bash
# My subscriptions: GitHub Home + explicitly followed personal RSS
FEED_DAY="$(TZ=Asia/Shanghai date +%F)" rss-summary digest --json --only-new --dry-run

# Industry frontier: curated official feeds + bounded paper queue
FEED_DAY="$(TZ=Asia/Shanghai date +%F)" rss-summary industry --json --only-new --dry-run
```

3. Inspect `audit.sources` first. Mention material source failures; do not treat a partial fetch as a complete quiet day.
4. Keep ordinary `link` candidates to one sentence plus the original link. Spend research time on likely `summary` candidates and every paper considered for publication.
5. Fill `CANDIDATES_JSON` and `FEED_STATE_JSON` in `prompts/feed-research.md`. Use `.state/feed-state.json` for subscriptions and `.state/industry-state.json` for frontier.
6. Return the final brief plus `调研状态更新建议:`.
7. Record research decisions:

```bash
rss-summary research add --file research-suggestions.txt
rss-summary research add --file research-suggestions.txt --state-file .state/industry-state.json
```

Do not commit `.state/`, run artifacts, browser storage, tokens, or generated research notes.

## Product rules

### My subscriptions

- Treat GitHub Home and personal blogs as one explicit subscription stream.
- Do not drop an ordinary item merely because it lacks broad popularity or keyword matches.
- Reuse `state.researched["github:owner/repo"]` to avoid repeating repository investigation, but do not interpret research cache as permission to suppress a later new event.
- Render routine updates in one sentence plus a link. Repeated mentions affect ranking only; expand an item only for an interest match or a concrete major/GA/breaking/deprecation/security change.

### Industry frontier

- Expect first-party company/project Blog, News, Changelog, Release, and research sources.
- Prefer concrete product, model, API, security, infrastructure, and developer-platform changes.
- Treat the curated source list as the first filter; use relevance and evidence quality to decide which items deserve expanded summaries.
- Do not reintroduce public GitHub Repository Search, Hacker News discovery, or secondary daily aggregators.

## Research rules

- GitHub discovery/star: inspect README, top-level tree, package/workspace files, entrypoints, tests/CI, recent activity, and release history. State when the judgment is surface-level.
- Pull request: explain the project, the exact behavioral/API/tooling change, why it matters, and whether action is needed. Do not stop at "pull request merged".
- Release: inspect release notes and breaking changes; report impact and upgrade risk.
- Article: open the original page when accessible. Summarize the claim, evidence, and practical relevance instead of paraphrasing only the feed excerpt.
- Paper: open canonical `arxiv.org/abs/<id>` and verify authors, institutions, question, method, results, limitations, and code/project links. Use ar5iv HTML only when the abstract is insufficient and the paper is likely to make the final 2–3. Never recommend from title alone.
- Skip low-value candidates explicitly in research state so omissions remain explainable.

### Code architecture and quality checks

For an unknown GitHub project that deserves an expanded summary, inspect the top-level tree, entrypoints, dependency/runtime choices, tests/CI, and recent commits, PRs, or releases. Judge whether modules are cohesive, public APIs and error paths are clear, examples prove the claim, and docs match code. Do not overclaim beyond the inspected surface.

## Output contract

Produce mobile-friendly Chinese Markdown:

- Use `**重点摘要**` / `**值得展开**` for a small number of researched items.
- For every expanded item include the link, a concrete short summary, why it matters, and one action: `track`, `read`, `try`, `save`, or `skip`.
- Use `**其他更新**` / `**动态速览**` for ordinary items, exactly one sentence plus a link each.
- Keep papers out until source verification is complete.
- Mention material source failures in a compact `数据源状态` note.
- Do not expose raw candidate JSON, scores, or audit internals in the visible brief.

Return stable research keys afterward:

```text
调研状态更新建议:
- github:owner/repo - decision=track reason="..."
- rss:https://example.com/post - decision=read reason="..."
```

## State and audit semantics

- `--only-new --dry-run` previews candidates without updating seen/researched state; a direct CLI run still creates a dry-run audit artifact.
- Subscription only-new filters delivered event IDs, not repository research cache.
- Frontier only-new filters delivered and researched candidates independently.
- Direct CLI audits live under `.state/runs`; inspect with `rss-summary runs list|failures|show`.
- Rivus Tool results contain source/candidate audit data; actual card delivery belongs to the Rivus trace and delivery ledger.

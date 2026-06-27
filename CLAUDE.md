# Claude Instructions

Follow `AGENTS.md` first. This file exists so Claude-based coding tools pick up the same repository workflow and runtime boundaries.

## Workflow

- Do not push directly to `main`.
- Work on a short-lived branch, preferably `codex/...` when Codex is driving the change or another descriptive feature branch when Claude is driving it.
- Open a pull request and wait for the `Verify` GitHub Actions check before merging.
- Run `pnpm verify` locally before saying a change is ready.

## Project Shape

- This repository is a local TypeScript CLI plus portable Codex skills.
- It is not a hosted service, daemon, or web app.
- Prefer the linked `rss-summary` command in docs and examples. Use `pnpm exec rss-summary ...` only as the repository-root fallback.
- Keep source adapters, domain ranking, local state, rendering, notification, and CLI entrypoints separate.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm verify
```

Useful focused commands:

```bash
pnpm test
pnpm typecheck
pnpm build
```

## Local And Secret Files

Do not commit `.env`, `.env.*`, `.state/`, `dist/`, `node_modules/`, local logs, tokens, or machine-specific paths.

## Design Notes

- GitHub visibility is controlled by `GH_FEED_TOKEN`, not by the machine running the CLI.
- `received_events` is a practical API approximation of GitHub Home Feed, not guaranteed exact UI parity.
- Deep research is currently a skill/model workflow, not a deterministic CLI command.
- `feeds.json` is the repository-maintained RSS subscription list. Update it intentionally and include those changes in the pull request.

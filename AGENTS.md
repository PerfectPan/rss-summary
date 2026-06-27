# Repository Instructions

## Workflow

- Do not push directly to `main`. Work on a `codex/...` branch and open a pull request.
- Keep changes focused and aligned with the existing TypeScript CLI structure.
- Run `pnpm verify` before claiming a change is ready.
- Do not commit `.env`, `.state/`, build output, local logs, tokens, or machine-specific paths.
- `feeds.json` is the repository-maintained RSS subscription list. Update it through `rss-summary feeds ...` when possible and include intentional feed changes in the pull request.

## Runtime Shape

- This repository is a local TypeScript CLI plus portable Codex skills, not a hosted service.
- Prefer the linked `rss-summary` bin in docs and workflows. Use `pnpm exec rss-summary ...` only as a fallback from the repository root.
- Keep source ingestion, domain ranking, state, rendering, and delivery as separate responsibilities.

## Git

- Use Conventional Commits with concise titles.
- Codex-assisted commits must end with:

```text
Generated with Codex

Co-Authored-By: Codex <noreply@openai.com>
```

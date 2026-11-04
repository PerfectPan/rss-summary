# Agent Guidelines

This repository is a local TypeScript CLI plus portable Codex skills. Treat every change as if it may be reviewed and installed by users. Follow `AGENTS.md` first; `CLAUDE.md` mirrors it for Claude-based tools.

## Working Rules

- Do not push directly to `main`. Work on a short descriptive branch and open a pull request.
- Keep changes scoped to the user request and nearby code; align with the existing TypeScript CLI structure.
- Prefer existing project patterns over new abstractions.
- Do not commit `.env`, `.state/`, build output, local logs, tokens, temporary workspaces, or machine-specific paths.
- Do not add private tokens, internal hostnames, private repository names, or personal filesystem paths.
- Use `rg` for searches when available.
- Run `pnpm verify` before claiming a change is ready (`test:layout` + `vp check` + tests + `tsc` build + package check). Prefer `vp` for lint/fmt/test when Vite+ is installed (`pnpm exec vp …`).
- Do not claim implementation work is complete until the relevant commands pass, or until skipped commands are explained with concrete blockers.
- Update tests and documentation when behavior changes.
- `feeds.json` is the repository-maintained RSS subscription list. Update it through `rss-summary feeds ...` when possible and include intentional feed changes in the pull request.

## Project-Specific Commands

```bash
# Install the shared review checks and local Git hooks:
gh extension install PerfectPan/gh-repo-checks
./scripts/install-git-hooks.sh

# Repository checks:
gh repo-checks repository

# PR title check:
gh repo-checks pr-title "docs: update project template"

# PR description check (file or stdin):
gh repo-checks pr-body pr-body.md

# Format / lint (Vite+):
pnpm fmt
pnpm lint

# Full local gate:
pnpm verify

# Coverage:
pnpm test:coverage

# Build:
pnpm build

# Package check:
pnpm package:check
```

## Development Workflow

For non-trivial changes:

1. Understand the requested behavior, affected domain concepts, ownership boundaries, and data flow.
2. Follow the Spec/Plan selection rules in `CONTRIBUTING.md`. Review required design artifacts before implementation. The Spec states required behavior; the Plan records technical decisions and the ordered tasks, tests, and exit conditions to execute. Do not start a Plan that is blocked on an unresolved decision. Migrate lasting constraints to current-state documentation.
3. Keep the implementation scoped to the task and nearby code.
4. Update tests and documentation when behavior, public contracts, or workflow expectations change.
5. Ensure local Git hooks are installed for the checkout when practical.
6. Run repository checks, title checks, and the project validation gates.
7. Open or update the PR with a summary of what changed and why, the exact validation and skipped gates, and any risks.

## Repository Architecture

Where code goes — the source tree is `src/kernel`, four business modules (`acquisition`, `reading`, `editorial`, `delivery`), `src/integrations`, and `src/app`:

- A business rule that answers "what is worth publishing / how is it identified / how is it scored" goes to the owning module's `domain/<concept>/` as pure TypeScript (no IO, no Effect, no `node:*`, no implicit clock; time and randomness arrive as arguments). Inside a concept, code sits in agent-kit building blocks: types and value objects in `value-objects/`, rules/thresholds/scoring in `policies/`, typed error values in `errors/`, domain events in `events/`, aggregate roots in `aggregates/` (`SearchBudget` is the only aggregate), their child entities in `entities/` (a `SearchBudget`'s cache entries; read only through the root), model-input constructors in `factories/`, stateless computation over several value objects in `services/`. Only the concept's `index.ts` facade and `*.test.ts` siblings may sit directly in the concept folder; concepts reference each other through their facades.
- Everything one external service knows about itself goes to `src/integrations/<service>/`: the transport (`client.ts` — requests, auth, timeouts, `Retry-After`, error codes), the response schemas and decoding (`dto.ts`), the translation into module models including that service's field semantics (`mapper.ts`), and the `Layer` implementing the owning module's port (`provider.ts` for `SearchProvider`, `feed.ts` for `RssFeed`/`WebPage`, `activity.ts`/`catalog.ts` for GitHub, `reader.ts` for readers). A service with several capabilities splits into capability subdirectories (`search/`, `reader/`, …) sharing one transport; multi-capability conventions like GLM's single MCP client live at the service root. Each integration is an anti-corruption layer and a driven adapter: it may import module `index.ts` facades, kernel, Effect, allow-listed packages, and `src/integrations/shared/` — never another service, and never `app`.
- `src/integrations/shared/` holds code several services share and nothing else: the HTTP plumbing over an injected `fetch`, the single Playwright browser lifecycle (playwright may be imported nowhere else), the JSON record helpers, the Schema decode helper, and the historical activity-card projection rss/web/GitHub share. It must not import a concrete service.
- An operation the module offers (collect, search, read, deliver) goes to `application/use-cases/` returning an `Effect`; its collaborator interfaces are `Context.Service` ports in `application/ports.ts`. The `application/` root keeps only `ports.ts` (and `errors.ts` where one exists) beside `use-cases/` and `services/`. Ports are the modules' only extension surface for external services — implementations live in `src/integrations/`.
- Module-local infrastructure that is not an external service goes to the module's `infra/` as a `Layer` implementing a port (`<Variant><Port>Live`), into `infra/factories/` when it composes layers, `infra/repository/` for state files, `infra/models/` for storage/config schemas, and the purposeful `infra/notifier/` / `infra/platform/` directories. The `infra/` root keeps only those subdirectories.
- Cross-module orchestration, the composition of module layers with their integrations (`app/layers.ts`), CLI/Rivus entry points, rendering, and environment parsing go to `src/app/`. `app`, and any sibling test that crosses a module boundary, reaches the other module only through its `index.ts`. Between business modules, only editorial may depend on acquisition and reading, and only through `import type`. Business modules never import `src/integrations/` — only `app` may.
- Under `src/app/products/`, one product never imports another; composition shared by products (the industry candidate pipeline, cross-product Tool ids) goes in `products/shared/`, which itself stays product-agnostic.
- `Effect.run*` may appear only in `src/app/runtime.ts` (test files excepted).
- The authoritative dependency rules are `scripts/architecture/boundaries.ts`, enforced with zero violations by `tests/repo/architecture.test.ts`. When a change needs an exception, change the rules file deliberately in the same PR — do not weaken the test.
- Unit tests sit next to the file they exercise (`<name>.test.ts` beside `<name>.ts`; enforced by `scripts/check-test-layout.mjs`). End-to-end golden snapshots, repository fixtures, repo harness tests, and shared adapter suites live under `tests/` (`golden/`, `fixtures/`, `repo/`, `support/`); never edit a golden snapshot to make a change pass.
- Terminology for domain words (Item, Evidence, Ledger, Edition, View IR, integration, …) is in `CONTEXT.md`.
- JavaScript or TypeScript projects take shared lint, format, and `tsconfig` rules from the `PerfectPan/lint-config` repository; see its README. Extend those shared configs instead of copying them.

## Runtime Shape

- This repository is a local TypeScript CLI plus portable Codex skills, not a hosted service.
- Prefer the linked `rss-summary` bin in docs and workflows. Use `pnpm exec rss-summary ...` only as a fallback from the repository root.
- Keep acquisition, editorial rules, reading, delivery, and rendering as separate responsibilities owned by their modules.

## Documentation

- Keep `README.md` focused on orientation, quick start, and current user-facing behavior.
- Use `CONTRIBUTING.md` for contribution workflow and repository policy; use `docs/specs/` for active product behavior and `docs/plans/` for technical decision records.
- Use `docs/` subdirectories for durable current-state knowledge: `architecture/`, `development/`, and `reference/`.
- When behavior, configuration, commands, APIs, or architecture change, update the relevant docs in the same PR or explain why no docs changed.

## AI Delivery Workflow

When an AI agent completes implementation work:

1. Inspect `git status --short --branch`.
2. Verify generated files, secrets, machine paths, and build artifacts are not staged.
3. Run the required verification gates and record the exact commands.
4. Commit pending changes with a concise conventional commit message.
5. Push the branch and verify the remote head.
6. Create or reuse a GitHub Pull Request when the task is not landing directly on `main`.
7. Include a delivery summary with what changed and why, validation, and remaining risks.

## Review Evidence

- PR titles must be English and follow `type(scope): summary`, including bot-generated dependency PRs; use `gh repo-checks pr-title` to verify them.
- PR descriptions must have a Summary (what changed and why) and a Validation section (exact commands and results, skipped gates with reasons); add Risks when there are any. Do not add agent attribution lines to the PR description. Verify the body with `gh repo-checks pr-body` before opening or updating the PR. Bot-opened PRs are exempt from the description check, not the title check.
- If a claim depends on logs, screenshots, package output, deployed behavior, or generated artifacts, attach or link the evidence in the PR.
- Update the PR description after substantial code changes, review-driven revisions, rebases that change behavior, or validation reruns.

## Git

- Use Conventional Commits with concise titles.
- AI-assisted commits end with the attribution of the tool that produced them — whichever agent ran, not one fixed tool. For example, Codex-assisted work ends with:

```text
Generated with Codex

Co-Authored-By: Codex <noreply@openai.com>
```

and other agents end with their own equivalent trailer. Attribution lines belong in the commit, not the PR description.

- Do not rewrite or discard user changes unless explicitly requested.

## Publish Safety Check

Before pushing public-facing changes, scan for accidental private references:

```bash
rg --hidden --no-ignore -n "private-token|secret|internal-domain.example|HOME_PATH_PLACEHOLDER" . \
  --glob '!.git/**' \
  --glob '!.omx/**' \
  --glob '!AGENTS.md' \
  --glob '!CONTRIBUTING.md' \
  --glob '!SECURITY.md'
```

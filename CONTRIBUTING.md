# Contributing to rss-summary

## Development Setup

```bash
# install local Git hooks
./scripts/install-git-hooks.sh

# install dependencies
pnpm install

# run the CLI locally (linked bin preferred)
pnpm exec rss-summary digest --help
pnpm exec rss-summary feeds list
```

Node 24 and pnpm 11.7.0 (corepack) are the supported runtimes, matching CI.

## Contribution Flow

1. Open an issue for ambiguous work.
2. Choose Spec and Plan artifacts using the [Change Design Gate](#change-design-gate) before substantial work. Review the behavior and technical design before implementing that scope.
3. Create a focused branch with a short descriptive name.
4. Install local Git hooks with `./scripts/install-git-hooks.sh` if this checkout has not already done so.
5. Identify the affected domain concepts, layer boundaries, data flow, and tests before changing code.
6. Implement the change, keeping responsibilities separated and using existing project patterns.
7. Add or update tests for behavior changes.
8. Update `README.md`, `docs/`, `AGENTS.md`, `CONTRIBUTING.md`, or the active Spec and Plan when user-facing behavior, architecture, development workflow, operations, or project policy changes.
9. Run repository checks, title checks, and the project validation gates.
10. Open a pull request with a conventional title, a summary of what changed and why, validation with skipped gates, and any risks.
11. Keep the PR description current after review feedback, rebases, validation reruns, or scope changes.

Small typo corrections, narrow documentation fixes, and repository metadata updates do not need a separate Spec and Plan.

## Required Checks

```bash
# Local Git hooks:
./scripts/install-git-hooks.sh

# Repository checks:
gh repo-checks repository

# PR title:
gh repo-checks pr-title "docs: update project template"

# PR description:
gh repo-checks pr-body pr-body.md

# Format and lint (Vite+):
pnpm fmt
pnpm lint

# Full local gate (test layout + vp check + tests + build + package check):
pnpm verify

# Coverage:
pnpm test:coverage

# Build:
pnpm build

# Package check:
pnpm package:check
```

`pnpm verify` must pass before claiming a change is ready. Do not edit a golden snapshot under `tests/golden/` to make a change pass; regenerate it deliberately and explain why in the PR.

## CI Execution Policy

`.github/workflows/ci.yml` runs on pull requests to `main` and pushes to `main`: a **Verify** job runs `pnpm verify`, and a **Coverage** job enforces the coverage thresholds configured in `vite.config.ts`.

The separate `review.yml` workflow is intentionally lightweight: repository hygiene, conventional title, and PR description checks. It runs on pull requests (including Drafts) and pushes to `main`. Bot authors remain exempt only from the description check. A skipped or stale job is not evidence that the change is safe; confirm the jobs executed and passed for the current head before merging.

## SDD Workflow And Document Lifecycle

1. Record the problem, affected users or maintainers, in-scope behavior, non-goals, and acceptance conditions.
2. Choose artifacts with the [Change Design Gate](#change-design-gate). Product work defaults to one behavioral Spec and one detailed Plan for the same deliverable. The Spec states required behavior: interactions and acceptance scenarios. The Plan owns the technical decisions (design, component and interface changes, data flow) and the detailed execution plan (ordered tasks, tests, exit conditions, validation, and rollback).
3. Review the behavior and technical design before implementing the affected scope. The Plan must resolve implementation decisions rather than leave them to the implementer; keep it blocked while a material decision is unresolved. New behavior revises the Spec. New implementation decisions revise the Plan.
4. Implement inside that boundary. Add evidence for each acceptance condition, or say why existing evidence is enough. Update current-state docs in the same change.
5. Before retiring a completed Spec or Plan, move still-valid behavior, invariants, and operational limits into current-state docs and tests. The final delivery PR may delete the completed files. Keep an unfinished Spec or Plan active.
6. Git history and the delivery PR keep the retired decision. Do not copy completed Specs or Plans into a second archive.

## Change Design Gate

Every change needs a requirement record. Use the smallest set of artifacts that makes behavior and implementation reviewable.

| Change type                                      | Required artifact                                              |
| ------------------------------------------------ | -------------------------------------------------------------- |
| Product behavior                                 | One Spec plus one detailed Plan for the same deliverable       |
| Technical refactor without changed user behavior | Detailed Plan with compatibility and acceptance conditions     |
| Narrow maintenance, tests, or documentation      | Requirement and PR checklist; a separate Plan only when useful |

A Spec defines observable interactions, scope, failure behavior, and acceptance examples. Use stable scenario IDs and Given/When/Then where useful. Link scenarios to tests. A Spec does not prescribe components, interfaces, or execution order. Keep active Specs under [`docs/specs/`](docs/specs/). A small change may keep both sections in the PR description. Split only when each slice has an independently demonstrable outcome.

A Plan records technical decisions and the detailed execution plan that implements them. Shared architecture, compatibility, security, and recovery decisions belong in a reviewed Plan. After implementation, move lasting constraints into current-state architecture or operations docs. Historical proposals live as delivered records under [`docs/plans/`](docs/plans/); removing a proposal does not mark unimplemented ideas as delivered.

## Implementation Plans

[`docs/plans/`](docs/plans/) contains active Plans: technical decisions plus a detailed execution plan. Copy [`0000-template.md`](docs/plans/0000-template.md) and keep only the sections that apply. A product plan links its paired Spec. Explain the current constraints, the decisions, the boundaries, the failure and rollback behavior, and how the change will be verified. A file list alone is not a design.

The execution plan tells the implementer exactly what to do: preconditions, a completion contract, ordered tasks with files, changes, tests, and exit conditions, a validation ledger, and rollback per batch. Keep the plan blocked while a decision that changes scope, interfaces, data, or rollout is unresolved.

Keep unknown owners, dates, and interfaces marked "unconfirmed". A plan may make feature-specific technical decisions, but it cannot silently override current architecture. At completion, migrate lasting constraints into current-state docs and tests, then delete the completed Spec and plan in the final delivery PR. Keep unfinished scope visible.

## Repository Architecture

`src/kernel` plus the four business modules (`acquisition`, `reading`, `editorial`, `delivery`), `src/integrations`, and `src/app` follow a domain → application → infra layering inside each module, with `src/app` as the only Effect-running layer and `src/integrations/` as the anti-corruption adapters. The authoritative dependency rules are `scripts/architecture/boundaries.ts`, enforced with zero violations by `tests/repo/architecture.test.ts`. The full layout rules live in [`AGENTS.md`](AGENTS.md#repository-architecture); the data flow and audit surfaces in [`docs/architecture/architecture.md`](docs/architecture/architecture.md).

For JavaScript or TypeScript, shared lint, format, and `tsconfig` rules come from the `PerfectPan/lint-config` repository; see its README. Extend those shared configs instead of copying them.

Avoid splitting code only to satisfy a mechanical one-export rule. Split when a file mixes responsibilities, a component or service needs independent testing, a boundary becomes reusable, or a change would otherwise make review harder.

## Documentation Standards

Keep each documentation surface focused:

- Use `README.md` for orientation, quick start, and current user-facing behavior.
- Use `CONTRIBUTING.md` for contribution workflow, review expectations, and repository policy.
- Use `AGENTS.md` for AI-agent instructions.
- Use `docs/specs/` for active product behavior and acceptance contracts.
- Use `docs/plans/` for active technical decisions and detailed execution plans. Migrate lasting decisions into current-state docs.
- Use `docs/` subdirectories for durable current-state knowledge: `architecture/`, `development/`, and `reference/`.

Follow [`docs/README.md`](docs/README.md) when adding or reorganizing project documentation. Update docs in the same change as behavior, configuration, command, API, deployment, architecture, or operational changes. Keep examples runnable when possible; otherwise, label them as illustrative and explain the validation gap.

## Pull Request Expectations

- Titles must be English and follow `type(scope): summary`, including bot-generated dependency PRs; use `gh repo-checks pr-title` to verify them.
- Descriptions must have a Summary (what changed and why) and a Validation section (exact commands and results, skipped gates with reasons); add Risks when there are any. Verify the body with `gh repo-checks pr-body` before opening or updating the PR. Bot-opened PRs are exempt from the description check, not the title check.
- If a claim depends on logs, screenshots, package output, deployed behavior, or generated artifacts, attach or link the evidence in the PR.
- Update the PR description after substantial code changes, review-driven revisions, rebases that change behavior, or validation reruns.

## Release Notes

`rss-summary` is a private, locally installed CLI; there is no package release or changelog flow. User-facing behavior changes are recorded in `README.md` and `docs/` in the same PR.

## License

GPL-3.0. See [`LICENSE`](LICENSE). By contributing, you agree that your contributions are licensed under the repository license.

## Repository Checks

The shared repository check (`PerfectPan/gh-repo-checks`) runs in `review.yml`, in the local pre-commit hook, and on demand:

```bash
gh repo-checks repository
```

Additions and exclusions live in [`.github/repo-checks.conf`](.github/repo-checks.conf). The conf currently requires the issue templates, the review workflow, and the pre-commit hook.

## Local Git Hooks

`.githooks/pre-commit` runs `git diff --cached --check` and `gh repo-checks repository --staged` when the `gh` extension is installed; it warns and skips otherwise. Install with:

```bash
./scripts/install-git-hooks.sh
```

## Repository Setup

For a newly created GitHub repository, configure branch protection with `gh repo-checks protect --apply` using an admin-authorized account. Make `repository checks`, `conventional PR title`, `PR description`, **Verify** and **Coverage** required checks. Template files do not configure branch protection.

## Security Reports

Do not report vulnerabilities in public issues when the report includes secrets, exploit details, private infrastructure, or user-specific data. Contact the repository owner directly through GitHub or use the repository security advisory flow; see [`SECURITY.md`](SECURITY.md).

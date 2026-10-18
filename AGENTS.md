# Repository Instructions

## Workflow

- Do not push directly to `main`. Work on a `codex/...` branch and open a pull request.
- Keep changes focused and aligned with the existing TypeScript CLI structure.
- Run `pnpm verify` before claiming a change is ready (`test:layout` + `vp check` + tests + `tsc` build + package check). Prefer `vp` for lint/fmt/test when Vite+ is installed (`pnpm exec vp …`).
- Do not commit `.env`, `.state/`, build output, local logs, tokens, or machine-specific paths.
- `feeds.json` is the repository-maintained RSS subscription list. Update it through `rss-summary feeds ...` when possible and include intentional feed changes in the pull request.

## Where Code Goes

The source tree is `src/kernel`, four business modules (`acquisition`, `reading`, `editorial`, `delivery`), and `src/app`:

- A business rule that answers "what is worth publishing / how is it identified / how is it scored" goes to the owning module's `domain/<concept>/` as pure TypeScript (no IO, no Effect, no `node:*`, no implicit clock; time and randomness arrive as arguments). Inside a concept, code sits in agent-kit building blocks: types and value objects in `value-objects/`, rules/thresholds/scoring in `policies/`, typed error values in `errors/`, domain events in `events/`, aggregate roots in `aggregates/` (`SearchBudget` is the only aggregate), their child entities in `entities/` (a `SearchBudget`'s cache entries; read only through the root), model-input constructors in `factories/`, stateless computation over several value objects in `services/`. Only the concept's `index.ts` facade and `*.test.ts` siblings may sit directly in the concept folder; concepts reference each other through their facades.
- Translating an external format (RSS, HTML, a GitHub payload, a provider response) goes to `domain/<concept>/adapters/` — declare the DTO with `effect/Schema`, decode, then map to the concept's model.
- An operation the module offers (collect, search, read, deliver) goes to `application/use-cases/` returning an `Effect`; its collaborator interfaces are `Context.Service` ports in `application/ports.ts`. The `application/` root keeps only `ports.ts` (and `errors.ts` where one exists) beside `use-cases/` and `services/`.
- Anything that touches the network, disk, a browser, or a subprocess goes to `infra/` as a `Layer` implementing a port (`<Variant><Port>Live`), or into `infra/factories/` when it composes layers or wires the port implementations together. The `infra/` root keeps only its subdirectories: `adapters/`, `repository/`, `models/`, `factories/`, `services/`.
- Cross-module orchestration, CLI/Rivus entry points, rendering, and environment parsing go to `src/app/`. `app`, and any sibling test that crosses a module boundary, reaches the other module only through its `index.ts`. Between business modules, only editorial may depend on acquisition and reading, and only through `import type`.
- Under `src/app/products/`, one product never imports another; composition shared by products (the industry candidate pipeline, the GLM research surface, cross-product Tool ids) goes in `products/shared/`, which itself stays product-agnostic.
- `Effect.run*` may appear only in `src/app/runtime.ts` (test files excepted).
- The authoritative dependency rules are `scripts/architecture/boundaries.ts`, enforced with zero violations by `tests/repo/architecture.test.ts`. When a change needs an exception, change the rules file deliberately in the same PR — do not weaken the test.
- Unit tests sit next to the file they exercise (`<name>.test.ts` beside `<name>.ts`; enforced by `scripts/check-test-layout.mjs`). End-to-end golden snapshots, repository fixtures, repo harness tests, and shared adapter suites live under `tests/` (`golden/`, `fixtures/`, `repo/`, `support/`); never edit a golden snapshot to make a change pass.
- Terminology for domain words (Item, Evidence, Ledger, Edition, View IR, …) is in `CONTEXT.md`.

## Runtime Shape

- This repository is a local TypeScript CLI plus portable Codex skills, not a hosted service.
- Prefer the linked `rss-summary` bin in docs and workflows. Use `pnpm exec rss-summary ...` only as a fallback from the repository root.
- Keep acquisition, editorial rules, reading, delivery, and rendering as separate responsibilities owned by their modules.

## Git

- Use Conventional Commits with concise titles.
- Codex-assisted commits must end with:

```text
Generated with Codex

Co-Authored-By: Codex <noreply@openai.com>
```

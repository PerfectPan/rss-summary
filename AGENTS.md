# Repository Instructions

## Workflow

- Do not push directly to `main`. Work on a `codex/...` branch and open a pull request.
- Keep changes focused and aligned with the existing TypeScript CLI structure.
- Run `pnpm verify` before claiming a change is ready (`test:layout` + `vp check` + tests + `tsc` build + package check). Prefer `vp` for lint/fmt/test when Vite+ is installed (`pnpm exec vp …`).
- Do not commit `.env`, `.state/`, build output, local logs, tokens, or machine-specific paths.
- `feeds.json` is the repository-maintained RSS subscription list. Update it through `rss-summary feeds ...` when possible and include intentional feed changes in the pull request.

## Where Code Goes

The source tree is `src/kernel`, four business modules (`acquisition`, `reading`, `editorial`, `delivery`), `src/integrations`, and `src/app`:

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

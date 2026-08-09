# Technology Decisions

Status: current
Date: 2026-08-09
Scope: what the repository uses, why, and when to revisit.

## Runtime

| Decision | Choice | Rationale |
| --- | --- | --- |
| Language | TypeScript, `strict`, ES2022, NodeNext ESM | The repository is a local CLI + portable skills; ESM keeps `import.meta.url`-based asset resolution and the Rivus plugin exports straightforward. |
| Node version | `^24.11.0` | Current LTS line; `AbortSignal.timeout`, native `fetch`, `URL` are all baseline. |
| Package manager | pnpm 11.7 (single workspace), invoked via Corepack or `vp install` | One package is correct at this size; pnpm gives a frozen lockfile for CI and content-addressed installs. Vite+ wraps the declared package manager. |
| Build | `tsc` (two configs: `noEmit` typecheck + declaration build) | Library/CLI ship is still plain `tsc` `dist/` for the Rivus plugin export surface. Vite+ does not replace the publish layout yet (`vp pack` is optional later). |
| Toolchain | **Vite+** (`vp`) | Unified check/test/lint/fmt; Oxlint replaces ESLint; Vitest runs through `vp test`. |

## Libraries

| Library | Where | Why | Revisit when |
| --- | --- | --- | --- |
| `effect` 3.x | `application/` use cases + entrypoint boundaries | Typed `Effect<Result, Error>` channels, `Effect.tryPromise` at ports, `Effect.runPromise` at entrypoints. Adoption is deliberately shallow (no `Context`/`Layer`). | Use cases need shared retry/rate-limit services; then move to `Context`/`Layer`. |
| Vite+ / Vitest 4 | `tests/`, `vite.config.ts` | `vp test` + v8 coverage thresholds; imports use `vite-plus/test`. | — |
| `fast-xml-parser` | `infrastructure/rss.ts` | RSS 2.0 / Atom parsing; small, dependency-light. | — |
| `cheerio` | `infrastructure/github-home.ts` | Conduit HTML snapshot extraction on the server side. | — |
| `playwright` | `infrastructure/github-home.ts` | GitHub Home login flow and rendered-browser fallback. The browser-automation code is explicitly excluded from unit coverage (`/* v8 ignore start */`) and exercised manually. | A different Home source replaces it. |
| `tsx` | dev only | Runs TS entrypoints directly (`pnpm digest`, `pnpm feeds`). | — |
| `lodash-es` | `infrastructure/parsing.ts` (and similar helpers) | Named path imports (`lodash-es/isPlainObject.js`) for JSON coercion helpers; tree-shakeable for bundlers, small module graph under Node ESM. Prefer library helpers over one-off reinvention when semantics match. | — |

## Side Effects (Effect adoption level)

Current boundary:

```text
presentation (runPromise) → application (Effect.gen + attempt) → ports (Promise fns) → infrastructure (imperative clients)
```

- Application use cases return `Effect<Result, Error>`; `attempt()` in `application/effect.ts` lifts promise-returning ports with `Effect.tryPromise`, mapping any throw to `Error`.
- Per-source failure isolation keeps `Promise.allSettled` semantics inside `attempt()`; Effect's structured concurrency is not yet used.
- Domain rules are framework-free: no Effect, no IO, no infra imports.

Deliberately not adopted yet:

- **`Context`/`Layer` services.** Deps-object injection already gives tests a zero-cost seam. Adopt Layers when retry or rate-limit services must be shared across use cases.
- **Typed error unions.** `Error` is the only error type; products surface warnings as data (`warnings: string[]`), not as error variants. Adopt a union when callers need to branch on failure class.

## Architecture Organization

Chosen: **DDD-inspired layered architecture with pipeline-shaped use cases** (see `docs/architecture.md` § Layered Structure).

Dependencies are **inward** (onion), not a linear `domain → application → infrastructure → presentation` import chain: domain is the pure center; application directs workflows; infrastructure runs adapters; presentation is the entrypoint and renderer. Plain-language roles: referee / director / runners / front desk.

Alternatives considered and rejected:

| Alternative | Why rejected now | Revisit when |
| --- | --- | --- |
| Feature-slice / modular monolith (`subscriptions/`, `frontier/`, `news/`) | The products share a small domain kernel and one Rivus profile; slicing would duplicate the kernel or add package indirection. | A product gains an independent deployment and lifecycle. |
| Pure pipeline/filter organization (each step its own folder) | Source interchangeability (the pipeline's main win) is not a real requirement today; the sources are fixed. The layered structure already keeps steps pure. | New interchangeable sources beyond the planned HF/PH tier. |
| Event sourcing / CQRS | Append-only run audits do not require a separate write/read model or replay semantics. | Never, absent a fundamental product change. |
| Aggregates/repositories | State and audit artifacts are simple local JSON records around immutable domain data. | Persistence gains lifecycle rules or multiple writers. |
| Microservices / multi-package | Single deployment unit; the Rivus plugin needs one module export. | Split when an independent deploy unit appears. |

## Testing Strategy

- **Layout**: `tests/` mirrors `src/` by layer (`domain/`, `application/`, `infrastructure/`, `presentation/`). Each `src/<layer>/<name>.ts` has `tests/<layer>/<name>.test.ts`. Repo/package harness lives under `tests/repo/`. Enforced by `pnpm test:layout` (`scripts/check-test-layout.mjs`).
- **Domain**: pure-function unit tests only — deterministic, no network, <2s for the whole suite.
- **Application**: use cases tested with injected fake ports (deps objects), including failure isolation and quota/warning behavior.
- **Infrastructure**: adapters tested with fixture payloads through injected `fetch`; never live network in CI. Browser automation is manually exercised and excluded from coverage.
- **Presentation**: CLI commands and the Rivus Plugin tested through injected executors and mocked modules.
- **Coverage gate**: `vp test run --coverage` with v8 thresholds — statements ≥85%, branches ≥75%, functions ≥90%, lines ≥85% — enforced as the `Coverage` CI check on every PR (also runs `test:layout`).

## Lint / format (Vite+)

- **Vite+** (`vite-plus` + `@voidzero-dev/vite-plus-core`) is the project toolchain entry.
- **Oxlint** (via `vp lint` / `vp check`) replaces ESLint; config lives in `vite.config.ts` `lint` block (type-aware).
- **Oxfmt** via `vp fmt` / included in `vp check`.
- Architecture import guards remain: `domain/**` cannot import outer layers / Effect / `node:*`; `application/**` cannot import `presentation/**`.
- `pnpm verify` runs `pnpm check` (`vp check`) after `test:layout`.

## CI Gates

`ci.yml` runs two jobs on every PR to `main`:

| Job | Command | Fails when |
| --- | --- | --- |
| `Verify` | `pnpm verify` | layout mismatch, check (fmt/lint/type) failure, test failure, build failure, or packed-package contract break |
| `Coverage` | `pnpm test:layout && pnpm test:coverage` | missing mirrored tests or coverage below the thresholds in `vite.config.ts` |

Both jobs are intended to be required checks in the branch protection rule for `main` (configure in GitHub → Settings → Branches → Branch protection rules; this cannot be expressed in the workflow file itself).

## Configuration Files

| File | Owner | Policy |
| --- | --- | --- |
| `feeds.json` | Explicit personal RSS subscriptions | Tracked; changed via `rss-summary feeds`. |
| `industry-feeds.json` | Curated first-party frontier sources | Tracked; changed intentionally and live-tested. |
| `news-topics.json` | Noon/evening topic policy | Tracked; validated by `infrastructure/news-topics.ts`. |
| `.env` / `.state/` | Local secrets, delivery/research state, and run audit artifacts | Gitignored. |

## Known Trade-Offs

- Shallow Effect adoption means `Promise.allSettled`-based fan-out rather than Effect structured concurrency; behavior parity was prioritized over idiomatic Effect during the refactor.
- Browser automation (`github-home.ts`) is the largest uncovered surface; it is isolated behind the client class and v8-ignored with a documented manual test path.
- `domain/` imports nothing outside itself (verified by convention); contract types such as `NewsTopic` and `RunAudit` are defined in the domain and imported by infrastructure, keeping dependencies inward.

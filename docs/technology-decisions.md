# Technology Decisions

Status: current  
Date: 2026-08-02  
Scope: what the repository uses, why, and when to revisit.

## Runtime

| Decision | Choice | Rationale |
| --- | --- | --- |
| Language | TypeScript, `strict`, ES2022, NodeNext ESM | The repository is a local CLI + portable skills; ESM keeps `import.meta.url`-based asset resolution and the Rivus plugin exports straightforward. |
| Node version | `^24.11.0` | Current LTS line; `AbortSignal.timeout`, native `fetch`, `URL` are all baseline. |
| Package manager | pnpm 11.7 (single workspace) | One package is correct at this size; pnpm gives a frozen lockfile for CI and content-addressed installs. |
| Build | `tsc` (two configs: `noEmit` typecheck + declaration build) | No bundler: the Rivus plugin is consumed as a compiled ESM directory, and `dist` is shipped whole. |

## Libraries

| Library | Where | Why | Revisit when |
| --- | --- | --- | --- |
| `effect` 3.x | `application/` use cases + entrypoint boundaries | Typed `Effect<Result, Error>` channels, `Effect.tryPromise` at ports, `Effect.runPromise` at entrypoints. Adoption is deliberately shallow (no `Context`/`Layer`). | A fourth product line appears, or use cases need shared retry/limit/logging services; then move to `Context`/`Layer` (see below). |
| `vitest` + `@vitest/coverage-v8` | `tests/` | Fast watch + v8 coverage with thresholds enforced in CI. | — |
| `fast-xml-parser` | `infrastructure/rss.ts` | RSS 2.0 / Atom parsing; small, dependency-light. | — |
| `cheerio` | `infrastructure/github-home.ts` | Conduit HTML snapshot extraction on the server side. | — |
| `playwright` | `infrastructure/github-home.ts` | GitHub Home login flow and rendered-browser fallback. The browser-automation code is explicitly excluded from unit coverage (`/* v8 ignore start */`) and exercised manually. | A different Home source replaces it. |
| `tsx` | dev only | Runs TS entrypoints directly (`pnpm digest`, `pnpm feeds`). | — |

## Side Effects (Effect adoption level)

Current boundary:

```text
presentation (runPromise) → application (Effect.gen + attempt) → ports (Promise fns) → infrastructure (imperative clients)
```

- Application use cases return `Effect<Result, Error>`; `attempt()` in `application/effect.ts` lifts promise-returning ports with `Effect.tryPromise`, mapping any throw to `Error`.
- Per-source failure isolation keeps `Promise.allSettled` semantics inside `attempt()`; Effect's structured concurrency is not yet used.
- Domain rules are framework-free: no Effect, no IO, no infra imports.

Deliberately not adopted yet:

- **`Context`/`Layer` services.** Deps-object injection already gives tests a zero-cost seam and the application boundary has only three use cases. Adopt Layers when a service (retry policy, rate limiter, logger) must be shared across use cases.
- **Typed error unions.** `Error` is the only error type; products surface warnings as data (`warnings: string[]`), not as error variants. Adopt a union when callers need to branch on failure class.

## Architecture Organization

Chosen: **layered DDD (domain → application → infrastructure → presentation) with pipeline-shaped use cases** (see `docs/architecture.md`).

Alternatives considered and rejected:

| Alternative | Why rejected now | Revisit when |
| --- | --- | --- |
| Feature-slice / modular monolith (`digest/`, `news/`, `signal/` as self-contained slices) | The three products share a domain kernel (`domain/text.ts`, `domain/time.ts`, `infrastructure/parsing.ts`) and one Rivus profile; slicing would duplicate the kernel or create a shared-package indirection. | A fourth product line with genuinely different config/state/automation lifecycle. |
| Pure pipeline/filter organization (each step its own folder) | Source interchangeability (the pipeline's main win) is not a real requirement today; the sources are fixed. The layered structure already keeps steps pure. | New interchangeable sources beyond the planned HF/PH tier. |
| Event sourcing / CQRS | No write model, no user input, no audit or cross-request consistency. | Never, absent a fundamental product change. |
| Aggregates/repositories | Domain objects are immutable data + pure transforms; there is no persistence to encapsulate. | A persistent aggregate (e.g., signal state) becomes non-trivial. |
| Microservices / multi-package | Single deployment unit; the Rivus plugin needs one module export. | Split when an independent deploy unit appears. |

## Testing Strategy

- **Layout**: `tests/` mirrors `src/` by layer (`domain/`, `application/`, `infrastructure/`, `presentation/`). Each `src/<layer>/<name>.ts` has `tests/<layer>/<name>.test.ts`. Repo/package harness lives under `tests/repo/`. Enforced by `pnpm test:layout` (`scripts/check-test-layout.mjs`).
- **Domain**: pure-function unit tests only — deterministic, no network, <2s for the whole suite.
- **Application**: use cases tested with injected fake ports (deps objects), including failure isolation and quota/warning behavior.
- **Infrastructure**: adapters tested with fixture payloads through injected `fetch`; never live network in CI. Browser automation is manually exercised and excluded from coverage.
- **Presentation**: CLI commands and the Rivus Plugin tested through injected executors and mocked modules.
- **Coverage gate**: `vitest --coverage` with v8 thresholds — statements ≥85%, branches ≥75%, functions ≥90%, lines ≥85% — enforced as the `Coverage` CI check on every PR (also runs `test:layout`).

## Lint

- **ESLint 9** flat config (`eslint.config.js`) + `typescript-eslint` recommended.
- Architecture import guards: `domain/**` cannot import outer layers / Effect / `node:*`; `application/**` cannot import `presentation/**`.
- Invoked as `pnpm lint` and included in `pnpm verify`.

## CI Gates

`ci.yml` runs two jobs on every PR to `main`:

| Job | Command | Fails when |
| --- | --- | --- |
| `Verify` | `pnpm verify` | layout mismatch, lint error, test failure, typecheck error, build failure, or packed-package contract break |
| `Coverage` | `pnpm test:layout && pnpm test:coverage` | missing mirrored tests or coverage below the thresholds in `vitest.config.ts` |

Both jobs are intended to be required checks in the branch protection rule for `main` (configure in GitHub → Settings → Branches → Branch protection rules; this cannot be expressed in the workflow file itself).

## Configuration Files

| File | Owner | Policy |
| --- | --- | --- |
| `feeds.json` | RSS subscriptions (morning digest only) | Tracked; changed via `rss-summary feeds`. |
| `news-topics.json` | Noon/evening topic policy | Tracked; validated by `infrastructure/news-topics.ts`. |
| `signal-sources.json` | Signal brief tuning (quotas, bias, scoring, sources) | Tracked; validated by `infrastructure/signal-sources.ts`. Not an RSS list. |
| `.env` / `.state/` | Local secrets and run state | Gitignored. |

## Known Trade-Offs

- Shallow Effect adoption means `Promise.allSettled`-based fan-out rather than Effect structured concurrency; behavior parity was prioritized over idiomatic Effect during the refactor.
- Browser automation (`github-home.ts`) is the largest uncovered surface; it is isolated behind the client class and v8-ignored with a documented manual test path.
- `domain/` imports nothing outside itself (verified by convention); contract types like `NewsTopic` and `SignalScoring` are defined in the domain and imported by infrastructure, keeping the dependency direction inward.

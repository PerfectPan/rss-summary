# Technology Decisions

Status: current
Date: 2026-10-18
Scope: what the repository uses, why, and when to revisit.

## Runtime

| Decision | Choice | Rationale |
| --- | --- | --- |
| Language | TypeScript, `strict`, ES2022, NodeNext ESM | The repository is a local CLI + portable skills; ESM keeps `import.meta.url`-based asset resolution and the Rivus plugin exports straightforward. |
| Node version | `^24.11.0` | Current LTS line; `AbortSignal.timeout`, native `fetch`, `URL` are all baseline. |
| Package manager | pnpm 11.7 (single workspace), invoked via Corepack or `vp install` | One package is correct at this size; pnpm gives a frozen lockfile for CI and content-addressed installs. Vite+ wraps the declared package manager. |
| Build | `tsc` (two configs: `noEmit` typecheck + declaration build excluding `src/**/*.test.ts`) | Library/CLI ship is still plain `tsc` `dist/` for the Rivus plugin export surface. Vite+ does not replace the publish layout yet (`vp pack` is optional later). |
| Toolchain | **Vite+** (`vp`) | Unified check/test/lint/fmt; Oxlint replaces ESLint; Vitest runs through `vp test`. |

## Libraries

| Library | Where | Why | Revisit when |
| --- | --- | --- | --- |
| `effect` — exact pin `4.0.0` | `application/` and `infra/` of every module, `app/`; `effect/Schema` only in domain adapters | See "Effect usage" below. Effect 4 is young and its minors may change APIs, so the version is exact rather than a range. `@rivus/agent` peers on `effect ^4.0.0` and resolves to the same copy, so the plugin and its host share one Effect instance; `check-package` evaluates the packed plugin with the `effect` the installed package resolves. | An Effect 4 release the code or `@rivus/agent` needs; re-pin deliberately and run the golden suite. |
| `@effect/platform-node` — exact pin `4.0.0` | `NodeFileSystem` for the acquisition source catalog repository (`acquisition/infra/node-file-system.ts`) and the app layer (`app/layers.ts`) | The real `FileSystem` service for production and tests, instead of hand-written file-system doubles; peers on `effect ^4.0.0`. | — |
| `effect/Schema` | format adapters (`domain/*/adapters/`) and storage models (`infra/models/`) | The single validation and decoding library (plan D2). Decode-then-map: each adapter declares only the fields it consumes, then maps to the concept's model; `onExcessProperty: "error"` guards the strict search budget file. | — |
| Vite+ / Vitest 4 | `vite.config.ts`, tests | `vp test` + v8 coverage thresholds; imports use `vite-plus/test`. | — |
| `fast-xml-parser` | `acquisition` RSS/Atom adapter | RSS 2.0 / Atom parsing; small, dependency-light. | — |
| `cheerio` | GitHub Home and listing-page adapters | Server-side extraction for GitHub Home snapshots and explicitly configured official listing pages. | A source requires JavaScript rendering or loses semantic link/time markup. |
| `playwright` | `acquisition/infra/adapters/browser.ts`, `reading/infra/adapters/browser-reader.ts` only | GitHub Home login/rendered fallback and isolated browser-first article research. Browser automation is explicitly excluded from unit coverage (`/* v8 ignore start */`) and exercised manually or through the Mac mini smoke path; the boundary checker confines the import to these two files. | A different browser/runtime replaces it. |
| `tsx` | dev only | Runs TS entrypoints directly (`pnpm digest`, `pnpm feeds`). | — |

There is no general utility library: `lodash-es` is not a dependency. Domain and kernel code use language built-ins; other layers use `effect/Array` and `effect/Schema` predicates.

## Effect usage

Effect has a fixed scope per layer; `scripts/architecture/boundaries.ts` enforces it:

- **domain/** (including adapters) stays pure TypeScript — no Effect types, no IO. This keeps the rules testable without a runtime and avoids binding them to a young Effect 4.
- **application/** returns `Effect` from every use case. Ports are `Context.Service`s keyed `rss-summary/<module>/<Port>/v1`.
- **infra/** implements ports as `Layer`s. Acquisition HTTP runs over Effect's `HttpClient` wrapped around an injected `fetch` (timeouts stay `AbortSignal.timeout` so transient failures remain `TimeoutError` for the retry predicates). The source catalog uses the platform `FileSystem`; the other state files use `node:fs` inside Effect so lock files, `fsync`, and file modes stay exact, with the search budget lock held by `acquireUseRelease` and writes run `uninterruptible`. Playwright sessions are scope-managed with `acquireRelease`. The Grok CLI child process uses `execFile` with its own kill signal, buffer cap, and temp directory cleanup.
- **app/** is the only place effects are run. `src/app/runtime.ts` holds the two runners (one `runPromiseExit` per CLI command; a `ManagedRuntime` per plugin execution); the boundary rule `effect-run` rejects `Effect.run*` anywhere else, test files excepted.

Concurrency and retry use Effect combinators: `Effect.forEach({ concurrency })` for independent fetches, `Effect.result` to isolate per-source failures, and a `Schedule`-based search backoff that tests drive with `TestClock`. Search requests that must not short-circuit on the first failure (the last budget slot must go to the request that reserved it) use an index-pulling worker in `acquisition/application/use-cases/search.ts`. `withBudget` shares one in-flight reservation per cache key within one fiber tree (a `Deferred` per key).

## Architecture Organization

Chosen: **modular DDD after the agent-kit layout** — a shared `kernel/`, four business modules (`acquisition`, `reading`, `editorial`, `delivery`), each with `domain/<concept>/` (plus `adapters/`), `application/` (ports + use cases), and `infra/`; and one `app/` layer that composes modules into the five products. `docs/architecture.md` documents the boundaries; `scripts/architecture/boundaries.ts` is the machine-readable rule set enforced by test.

Differences from agent-kit, all deliberate:

| Difference | Reason |
| --- | --- |
| Validation uses `effect/Schema`, not zod | One schema vocabulary with the rest of Effect; decode-then-map adapters (plan D2). |
| `domain/*/adapters/` may import `effect/Schema` | Decoding external formats belongs in the adapters; every other Effect API stays out of the domain. |
| `infra/` may import the module's domain adapters | "Fetch → DTO → model" happens in one place. agent-kit does not allow infra to reach adapters. |
| Single package, not a monorepo | One deployment unit and one Rivus export; agent-kit's per-context packages exist because it ships several independently versioned contexts. |

Alternatives considered and rejected:

| Alternative | Why rejected now | Revisit when |
| --- | --- | --- |
| Technical layers as top-level directories (`domain/`, `application/`, `infrastructure/`, `presentation/`) | Slicing by technology lets each product grow its own copy of shared concepts (its own item model, "already sent" memory, and time window). | Never; the module split exists to give each concept one owner. |
| Product-slice modules (`subscriptions/`, `frontier/`, `news/`) | Products share one kernel and one Rivus profile; slicing would duplicate the kernel or add indirection. | A product gains an independent deployment and lifecycle. |
| Pure pipeline/filter organization (each step its own folder) | RSS and verified page adapters are interchangeable at the infra boundary, but they share one policy after normalization. | A source type gains distinct ranking, state, or deployment rules. |
| Event sourcing / CQRS; aggregates/repositories over a database | Append-only run audits and simple JSON state do not need replay semantics or another engine; the one multi-writer file is already locked. | Persistence gains lifecycle rules or multiple writers. |
| Microservices / multi-package | Single deployment unit; the Rivus plugin needs one module export. | Split when an independent deploy unit appears. |

## Testing Strategy

- **Layout**: unit tests live next to their source file (`src/<module>/<path>/<name>.test.ts`); package-level and cross-module tests live under `tests/` (`golden/`, `fixtures/`, `repo/`, `support/`). Enforced by `pnpm test:layout` (`scripts/check-test-layout.mjs`); pure re-export and type-only modules are exempt, every other exemption is listed with its reason.
- **Golden lock**: `tests/golden/` runs the real CLI and plugin entry points against stubbed fetch, temp state directories, and fixture executables, snapshotting Markdown/JSON output and the full plugin registration. These snapshots define the externally visible behavior; they are never updated to make a refactor pass.
- **Domain**: pure-function unit tests — deterministic, no network.
- **Adapters**: field-level tests against fixture payloads, decoded through `effect/Schema`.
- **Use cases / product flows**: substitute layers and injected options, with `TestClock` driving backoff timing.
- **Search providers**: one shared suite (`tests/support/search-provider-suite.ts`) runs against every `SearchProvider` implementation, then combined with `withBudget` and `withRetry`.
- **Coverage gate**: `vp test run --coverage` with v8 thresholds — statements ≥85%, branches ≥75%, functions ≥90%, lines ≥85% over production files (sibling tests excluded) — enforced as the `Coverage` CI check on every PR (also runs `test:layout`).
- **Packed package**: `scripts/check-package.mjs` installs the tarball into a consumer and asserts the plugin loads, packaged assets resolve, and no `*.test.*` file ships.

## Lint / format (Vite+)

- **Vite+** (`vite-plus` + `@voidzero-dev/vite-plus-core`) is the project toolchain entry.
- **Oxlint** (via `vp lint` / `vp check`) replaces ESLint; config lives in `vite.config.ts` `lint` block (type-aware). Lint and format cover the sibling test files like any source.
- **Oxfmt** via `vp fmt` / included in `vp check`.
- Import direction is enforced by the architecture test (`scripts/architecture/boundaries.ts` + `tests/repo/architecture.test.ts`, zero violations), not by lint rules.
- `pnpm verify` runs `pnpm check` (`vp check`) after `test:layout`.

## CI Gates

`ci.yml` runs two jobs on every PR to `main`:

| Job | Command | Fails when |
| --- | --- | --- |
| `Verify` | `pnpm verify` | layout mismatch, check (fmt/lint/type) failure, test failure, build failure, or packed-package check failure |
| `Coverage` | `pnpm test:layout && pnpm test:coverage` | missing sibling tests or coverage below the thresholds in `vite.config.ts` |

Both jobs are intended to be required checks in the branch protection rule for `main` (configure in GitHub → Settings → Branches → Branch protection rules; this cannot be expressed in the workflow file itself).

## Configuration Files

| File | Owner | Policy |
| --- | --- | --- |
| `feeds.json` | Explicit personal RSS subscriptions | Tracked; changed via `rss-summary feeds`. |
| `industry-feeds.json` | Curated first-party RSS/Atom and verified listing-page sources | Tracked; changed intentionally and live-tested. |
| `news-topics.json` | Noon/evening structured query, relevance, exclusion, source, and quota policy | Tracked; validated by `app/products/news/topics.ts`. |
| `.env` / `.state/` | Local secrets, delivery/research state, and run audit artifacts | Gitignored. |

## Known Trade-Offs

- The Daily AI Digest uses a two-phase Agent-editor protocol: `collect` exposes normalized evidence from the rolling 24-hour window, and `render` accepts structured `{category, headline, refs}` records. The Agent owns selection, translation/summarization and classification. Code performs per-item structural, category, length and reference checks only; valid siblings survive an invalid item, while an all-invalid draft returns a typed retryable error against the cached evidence snapshot.
- Browser automation (the two Playwright adapters) is isolated behind Effect adapters and v8-ignored with documented manual/smoke test paths. Article research uses an isolated context with no storage state, only navigates the selected public URL, and falls back to bounded HTTP extraction when browser rendering fails.
- editorial sees upstream modules only through types; behavior it needs from them, such as the evidence identity functions (`EvidenceIdentity`), is passed in by `app`, so the module stays pure.

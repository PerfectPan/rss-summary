import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, type FileHandle } from "node:fs/promises";
import { dirname } from "node:path";
import { Effect, Layer, Schema } from "effect";

import { normalizeProvider } from "../../domain/budget/adapters/provider.js";
import {
  SearchBudget,
  type BudgetLimits,
  type BudgetState,
  type HashText,
} from "../../domain/budget/search-budget.js";
import { NewsSearchError } from "../../domain/search/search.js";
import { isErr } from "../../../kernel/result.js";
import { SearchBudgetRepository } from "../../application/ports.js";
import { newsSearchStateSchema } from "../models/news-search.js";

const lockTimeoutMs = 2_000;
const lockRetryMs = 20;

export function sha256(material: string): string {
  return createHash("sha256").update(material).digest("hex");
}

export function loadSearchBudget(
  path: string,
  limits: BudgetLimits,
  hash: HashText = sha256,
  normalize: (provider: string) => string = normalizeProvider,
): Effect.Effect<SearchBudget, NewsSearchError> {
  return Effect.gen(function* () {
    const read = yield* Effect.result(
      Effect.tryPromise({
        try: () => readFile(path, "utf8"),
        catch: (cause) => cause,
      }),
    );
    if (read._tag === "Failure") {
      if (hasCode(read.failure, "ENOENT")) return SearchBudget.empty(limits);
      return yield* Effect.fail(stateError("Cannot read local search budget state."));
    }
    return yield* Effect.try({
      try: () => {
        const decoded = Schema.decodeUnknownSync(newsSearchStateSchema)(JSON.parse(read.success), {
          onExcessProperty: "error",
        });
        const restored = SearchBudget.restore(decoded as BudgetState, limits, { hash, normalize });
        if (isErr(restored)) throw restored.error;
        return restored.value.state;
      },
      catch: (cause) =>
        cause instanceof NewsSearchError
          ? cause
          : stateError("Local search budget state is invalid; preserve it for recovery."),
    });
  });
}

export function saveSearchBudget(
  path: string,
  state: BudgetState,
): Effect.Effect<void, NewsSearchError> {
  return Effect.uninterruptible(
    Effect.tryPromise({
      try: () => writeState(path, state),
      catch: (cause) =>
        cause instanceof NewsSearchError
          ? cause
          : stateError("Cannot persist local search budget state."),
    }),
  );
}

/**
 * The release error replaces the operation error, matching the historical lock.
 * `acquireUseRelease` runs the release on success, failure and interruption.
 */
export function withSearchBudgetLock<A, E>(
  path: string,
  operation: Effect.Effect<A, E>,
): Effect.Effect<A, E | NewsSearchError> {
  return Effect.acquireUseRelease(
    acquireLock(path),
    () => operation,
    (lock) =>
      Effect.tryPromise({
        try: async () => {
          await lock.close();
          await unlink(`${path}.lock`);
        },
        catch: () => stateError("Cannot release local search budget lock."),
      }),
  );
}

export const SearchBudgetRepositoryLive: Layer.Layer<SearchBudgetRepository> = Layer.succeed(
  SearchBudgetRepository,
  {
    load: (path, limits) => loadSearchBudget(path, limits),
    save: (path, state) => saveSearchBudget(path, state),
    withLock: (path, effect) => withSearchBudgetLock(path, effect),
  },
);

function acquireLock(path: string): Effect.Effect<FileHandle, NewsSearchError> {
  const lockPath = `${path}.lock`;
  return Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: () => mkdir(dirname(path), { recursive: true, mode: 0o700 }),
      catch: () => stateError("Cannot create local search budget directory."),
    });
    const deadline = Date.now() + lockTimeoutMs;
    while (true) {
      const opened = yield* Effect.result(
        Effect.tryPromise({
          try: () => open(lockPath, "wx", 0o600),
          catch: (cause) => cause,
        }),
      );
      if (opened._tag === "Success") return opened.success;
      if (!hasCode(opened.failure, "EEXIST")) {
        return yield* Effect.fail(stateError("Cannot lock local search budget state."));
      }
      if (Date.now() >= deadline) {
        return yield* Effect.fail(
          stateError("Local search budget lock timed out; preserve the lock for recovery."),
        );
      }
      yield* Effect.sleep(`${lockRetryMs} millis`);
    }
  });
}

async function writeState(path: string, state: BudgetState): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(`${JSON.stringify(state)}\n`, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
    const directory = await open(dirname(path), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (cause) {
    if (cause instanceof NewsSearchError) throw cause;
    throw stateError("Cannot persist local search budget state.");
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

function hasCode(cause: unknown, code: string): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code?: unknown }).code === code
  );
}

function stateError(message: string): NewsSearchError {
  return new NewsSearchError("local_budget_state", message);
}

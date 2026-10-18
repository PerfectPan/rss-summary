import { Clock, Duration, Effect, Random, Schedule } from "effect";

import {
  isSearchFailure,
  type NewsSearchError,
  type SearchInput,
  type SearchPage,
} from "../../domain/search/index.js";

export const searchRetryLimit = 3;
const retryBaseMs = 250;

export type RetryDependencies = {
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export function isTransientSearchError(error: unknown): error is NewsSearchError {
  return (
    isSearchFailure(error) && (error.code === "rate_limit_exceeded" || error.code === "http_429")
  );
}

/** Historical backoff: `retryAfterMs`, otherwise `round(250 * 2^(n-1) * (0.5 + clamp(random, 0, 1)))`. */
export function retryDelayMs(
  error: { retryAfterMs?: number },
  attemptNumber: number,
  random: () => number,
): number {
  if (error.retryAfterMs !== undefined) return error.retryAfterMs;
  const jitter = 0.5 + Math.min(1, Math.max(0, random()));
  return Math.round(retryBaseMs * 2 ** (attemptNumber - 1) * jitter);
}

/**
 * `Schedule.addDelay` passes 1-based `attempt` metadata for the retry about to
 * sleep. That number is the historical attempt (`1` on the first failure).
 * `attemptBase` shifts it when a caller needs a different origin.
 */
export function retrySchedule(attemptBase = 0) {
  return Schedule.recurs(searchRetryLimit - 1).pipe(
    Schedule.addDelay((metadata) =>
      Effect.gen(function* () {
        const sample = yield* Random.next;
        const error = metadata.input as { retryAfterMs?: number };
        return Duration.millis(retryDelayMs(error, metadata.attempt + attemptBase, () => sample));
      }),
    ),
  );
}

export function retryEffect<A>(run: () => Promise<A>, attemptBase = 0) {
  return Effect.tryPromise({
    try: run,
    catch: (cause) => cause,
  }).pipe(
    Effect.retry({
      while: (cause: unknown) => isTransientSearchError(cause),
      schedule: retrySchedule(attemptBase),
    }),
  );
}

export function provideRetryClock<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  dependencies: RetryDependencies = {},
): Effect.Effect<A, E, R> {
  let provided = effect;
  if (dependencies.random) {
    const random = dependencies.random;
    provided = Effect.provideService(provided, Random.Random, {
      nextDoubleUnsafe: random,
      nextIntUnsafe: () => 0,
    });
  }
  if (dependencies.sleep) {
    const sleep = dependencies.sleep;
    const clock: Clock.Clock = {
      currentTimeMillisUnsafe: () => Date.now(),
      currentTimeMillis: Effect.sync(() => Date.now()),
      monotonicTimeNanosUnsafe: () => BigInt(Date.now()) * 1_000_000n,
      monotonicTimeNanos: Effect.sync(() => BigInt(Date.now()) * 1_000_000n),
      currentTimeNanosUnsafe: () => BigInt(Date.now()) * 1_000_000n,
      currentTimeNanos: Effect.sync(() => BigInt(Date.now()) * 1_000_000n),
      sleep: (duration) => Effect.promise(() => sleep(Duration.toMillis(duration))),
    };
    provided = Effect.provideService(provided, Clock.Clock, clock);
  }
  return provided;
}

export function searchWithRetry(
  input: SearchInput,
  search: (input: SearchInput) => Promise<SearchPage>,
  dependencies: RetryDependencies = {},
): Effect.Effect<SearchPage, unknown> {
  return provideRetryClock(
    retryEffect(() => search(input)),
    dependencies,
  );
}

/** Retry an Effect-based search with the historical schedule and injected clock. */
export function retrySearchEffect<A>(
  effect: Effect.Effect<A, unknown>,
  dependencies: RetryDependencies = {},
): Effect.Effect<A, unknown> {
  return provideRetryClock(
    effect.pipe(Effect.retry({ while: isTransientSearchError, schedule: retrySchedule() })),
    dependencies,
  );
}

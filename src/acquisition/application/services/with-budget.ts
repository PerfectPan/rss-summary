import { Deferred, Effect } from "effect";

import { isErr } from "../../../kernel/result.js";
import { parseCacheRequest } from "./cache-request.js";
import { presentCachedPage } from "../../domain/budget/index.js";
import {
  cacheKey,
  validateBudgetOptions,
  type BudgetLimits,
  type BudgetState,
  type BudgetUsage,
  type CachedPage,
  type CacheRequest,
  type HashText,
  type PresentCache,
  type SearchBudget,
} from "../../domain/budget/index.js";
import {
  NewsSearchError,
  type SearchInput,
  type SearchPage,
  type SearchUsage,
} from "../../domain/search/index.js";

export type BudgetedSearchPage = SearchPage & { searchUsage: SearchUsage };

export type BudgetedSearch = {
  (input: SearchInput): Effect.Effect<BudgetedSearchPage, unknown>;
  cachedSearch: (
    input: SearchInput,
  ) => Effect.Effect<BudgetedSearchPage | undefined, NewsSearchError>;
};

export type BudgetInspection = {
  usage: BudgetUsage;
  cached?: SearchPage;
};

/** File and hash details stay outside this service. The driver closes over them. */
export type BudgetDriver = {
  stateFile: string;
  limits: BudgetLimits;
  provider: string;
  now: () => Date;
  hash: HashText;
  normalize: (provider: string) => string;
  isCacheable: (page: SearchPage) => boolean;
  decodePage: (page: SearchPage) => CachedPage;
  presentCache?: PresentCache;
  load: () => Effect.Effect<SearchBudget, NewsSearchError>;
  save: (state: BudgetState) => Effect.Effect<void, NewsSearchError>;
  withLock: <A, E>(effect: Effect.Effect<A, E>) => Effect.Effect<A, E | NewsSearchError>;
};

export function withBudget(
  search: (input: SearchInput) => Promise<SearchPage>,
  driver: BudgetDriver,
): BudgetedSearch {
  validateBudgetOptions({
    dailyLimit: driver.limits.dailyLimit,
    monthlyLimit: driver.limits.monthlyLimit,
    cacheTtlMs: driver.limits.cacheTtlMs,
    stateFile: driver.stateFile,
    timezoneOffset: driver.limits.timezoneOffset,
  });
  const provider = driver.normalize(driver.provider);
  const present = driver.presentCache ?? presentCachedPage;
  // In-flight dedup keyed by cache request: one daemon execution per key, every
  // concurrent caller awaits the same Deferred, and the entry is dropped when
  // the attempt settles so the next call reserves again.
  const pending = new Map<string, Deferred.Deferred<BudgetedSearchPage, unknown>>();

  const run = (input: SearchInput): Effect.Effect<BudgetedSearchPage, unknown> => {
    const request = parseCacheRequest(input, provider);
    const key = cacheKey(request, driver.hash);
    return Effect.gen(function* () {
      let deferred = pending.get(key);
      if (!deferred) {
        deferred = yield* Deferred.make<BudgetedSearchPage, unknown>();
        pending.set(key, deferred);
        const entry = deferred;
        yield* Effect.forkDetach(
          Effect.exit(execute(input, request)).pipe(
            Effect.flatMap((exit) => Deferred.done(entry, exit)),
            Effect.ignore,
            Effect.ensuring(Effect.sync(() => pending.delete(key))),
          ),
        );
      }
      return yield* Deferred.await(deferred);
    });
  };

  return Object.assign(run, {
    cachedSearch: (
      input: SearchInput,
    ): Effect.Effect<BudgetedSearchPage | undefined, NewsSearchError> => {
      const request = parseCacheRequest(input, provider);
      return Effect.map(
        inspect(request, false),
        (value) => value.cached as BudgetedSearchPage | undefined,
      );
    },
  });

  function inspect(request: CacheRequest, commit: boolean) {
    return driver.withLock(
      Effect.gen(function* () {
        const budget = yield* driver.load();
        const transition = yield* Effect.try({
          try: () => budget.reserve(request, driver.now(), commit, present),
          catch: (cause) =>
            cause instanceof NewsSearchError
              ? cause
              : new NewsSearchError(
                  "local_budget_state",
                  cause instanceof Error ? cause.message : String(cause),
                ),
        });
        if (isErr(transition)) return yield* Effect.fail(transition.error);
        if (transition.value.events.some((event) => event._tag === "Reserved")) {
          yield* driver.save(transition.value.state.persisted);
        }
        return transition.value.value;
      }),
    );
  }

  function execute(input: SearchInput, request: CacheRequest) {
    return Effect.gen(function* () {
      const reservation = yield* inspect(request, true);
      if (reservation.cached) return reservation.cached as BudgetedSearchPage;
      const page = yield* Effect.tryPromise({
        try: () => search(input),
        catch: (cause) => cause,
      });
      const fetchedAt = driver.now().toISOString();
      if (driver.isCacheable(page)) {
        const rawPage = yield* Effect.try({
          try: () => driver.decodePage(page),
          catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
        });
        yield* driver.withLock(
          Effect.gen(function* () {
            const budget = yield* driver.load();
            const remembered = budget.remember(
              request,
              rawPage,
              fetchedAt,
              driver.hash,
              driver.isCacheable,
            );
            if (isErr(remembered)) return yield* Effect.fail(remembered.error);
            if (remembered.value.events.some((event) => event._tag === "CacheStored")) {
              yield* driver.save(remembered.value.state.persisted);
            }
          }),
        );
      }
      return {
        ...page,
        searchUsage: {
          ...reservation.usage,
          source: "network" as const,
          fetchedAt,
        },
      };
    });
  }
}

import { err, ok, type Result } from "../../../../kernel/result.js";
import { calendarDayAtOffset } from "../../../../kernel/time.js";
import { NewsSearchError, type SearchPage } from "../../search/index.js";
import { isFresh, matchesRequest, type CacheEntry } from "../entities/cache-entry.js";
import type { BudgetEvent } from "../events/budget-event.js";
import { usageFor } from "../services/budget-state.js";
import {
  cacheKey,
  type BudgetLimits,
  type BudgetUsage,
  type CacheRequest,
  type CachedPage,
  type HashText,
  type Reservation,
} from "../value-objects/budget.js";

/**
 * The aggregate's persisted snapshot. Prior days stay in `daily` so a rollback
 * cannot reopen a spent allowance; `cache` holds the entity entries, saved with
 * the aggregate as a whole.
 */
export type BudgetState = {
  version: 1;
  timezoneOffset: string;
  daily: Record<string, number>;
  cache: Record<string, CacheEntry>;
};

/**
 * Renders a cache hit in the caller's page shape; `reserve` takes it as an
 * argument so the aggregate itself does not present pages.
 */
export type PresentCache = (entry: CacheEntry, usage: BudgetUsage) => SearchPage;

export type BudgetTransition<A> = {
  readonly state: SearchBudget;
  readonly events: readonly BudgetEvent[];
  readonly value: A;
};

type RestoreOptions = {
  hash: HashText;
  normalize: (provider: string) => string;
};

/**
 * Persisted search allowance. Construction stays private so every change goes
 * through `restore` or `reserve`, which either return the next state plus
 * events or a tagged failure. A reservation is consumed even when the provider
 * later fails: this aggregate has no refund.
 */
export class SearchBudget {
  private constructor(
    readonly persisted: BudgetState,
    readonly limits: BudgetLimits,
  ) {}

  static restore(
    persisted: BudgetState,
    limits: BudgetLimits,
    options: RestoreOptions,
  ): Result<{ state: SearchBudget; events: readonly BudgetEvent[] }, NewsSearchError> {
    const failure = validatePersisted(persisted, limits.timezoneOffset, options);
    if (failure) return err(failure);
    return ok({ state: new SearchBudget(persisted, limits), events: [] });
  }

  /** Empty ledger used when the state file does not exist yet. */
  static empty(limits: BudgetLimits): SearchBudget {
    return new SearchBudget(
      { version: 1, timezoneOffset: limits.timezoneOffset, daily: {}, cache: {} },
      limits,
    );
  }

  usage(instant: Date): BudgetUsage {
    return usageFor(this.persisted, instant, this.limits);
  }

  /**
   * The freshest entry whose stored request answers the asked one, or none.
   * Cache entries are read only through this method; the freshness and request
   * rules of a single entry live on the entity.
   */
  findCache(request: CacheRequest, instant: number): CacheEntry | undefined {
    return Object.values(this.persisted.cache)
      .filter(
        (entry) =>
          isFresh(entry, instant, this.limits.cacheTtlMs) && matchesRequest(entry, request),
      )
      .sort((left, right) => Date.parse(right.fetchedAt) - Date.parse(left.fetchedAt))[0];
  }

  /**
   * Cache hit returns the same state. With `commit`, a free slot returns a new
   * state whose day counter is one higher. Without `commit` the counter stays
   * put so a cache probe does not spend an attempt. An exhausted allowance
   * returns the historical budget error and does not change the state.
   */
  reserve(
    request: CacheRequest,
    instant: Date,
    commit: boolean,
    present: PresentCache,
  ): Result<BudgetTransition<Reservation>, NewsSearchError> {
    const usage = this.usage(instant);
    const cached = this.findCache(request, instant.getTime());
    if (cached) {
      return ok({
        state: this,
        events: [{ _tag: "CacheHit", fetchedAt: cached.fetchedAt }],
        value: {
          usage,
          cached: present(cached, usage),
        },
      });
    }
    if (
      usage.dailyUsed >= this.limits.dailyLimit ||
      usage.monthlyUsed >= this.limits.monthlyLimit
    ) {
      return err(
        new NewsSearchError(
          "local_budget_exhausted",
          `Local search budget exhausted (daily ${usage.dailyUsed}/${this.limits.dailyLimit}, monthly ${usage.monthlyUsed}/${this.limits.monthlyLimit}).`,
        ),
      );
    }
    if (!commit) {
      return ok({ state: this, events: [], value: { usage } });
    }
    const day = calendarDayAtOffset(instant.toISOString(), this.limits.timezoneOffset);
    const nextUsage: BudgetUsage = {
      ...usage,
      dailyUsed: usage.dailyUsed + 1,
      monthlyUsed: usage.monthlyUsed + 1,
    };
    const state = new SearchBudget(
      {
        ...this.persisted,
        // Prior days stay so a clock rollback cannot reopen a spent allowance.
        daily: { ...this.persisted.daily, [day]: usage.dailyUsed + 1 },
      },
      this.limits,
    );
    return ok({
      state,
      events: [
        {
          _tag: "Reserved",
          day,
          dailyUsed: nextUsage.dailyUsed,
          monthlyUsed: nextUsage.monthlyUsed,
        },
      ],
      value: { usage: nextUsage },
    });
  }

  remember(
    request: CacheRequest,
    page: CachedPage,
    fetchedAt: string,
    hash: HashText,
    isCacheable: (page: SearchPage) => boolean,
  ): Result<BudgetTransition<void>, NewsSearchError> {
    if (!isCacheable(page)) {
      return ok({ state: this, events: [], value: undefined });
    }
    const key = cacheKey(request, hash);
    const instant = Date.parse(fetchedAt);
    const cache = Object.fromEntries(
      Object.entries(this.persisted.cache).filter(([, entry]) =>
        isFresh(entry, instant, this.limits.cacheTtlMs),
      ),
    );
    const state = new SearchBudget(
      {
        ...this.persisted,
        cache: { ...cache, [key]: { request, fetchedAt, page } },
      },
      this.limits,
    );
    return ok({
      state,
      events: [{ _tag: "CacheStored", key, fetchedAt }],
      value: undefined,
    });
  }
}

function validatePersisted(
  state: BudgetState,
  timezoneOffset: string,
  options: RestoreOptions,
): NewsSearchError | undefined {
  if (state.timezoneOffset !== timezoneOffset) {
    return new NewsSearchError(
      "local_budget_state",
      "Local search budget timezone differs from the configured timezone.",
    );
  }
  for (const [key, entry] of Object.entries(state.cache)) {
    if (
      key !== cacheKey(entry.request, options.hash) ||
      entry.request.sinceDay > entry.request.day ||
      options.normalize(entry.request.provider) !== entry.request.provider
    ) {
      return new NewsSearchError("local_budget_state", "Invalid local search cache entry.");
    }
  }
  return undefined;
}

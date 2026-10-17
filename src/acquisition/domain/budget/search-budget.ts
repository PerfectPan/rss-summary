import { err, ok, type Result } from "../../../kernel/result.js";
import { calendarDayAtOffset, parseOffsetMilliseconds } from "../../../kernel/time.js";
import {
  NewsSearchError,
  type SearchPage,
  type SearchResult,
  type SearchSourcePolicy,
} from "../search/search.js";

export type CacheRequest = {
  provider: string;
  query: string;
  count: number;
  day: string;
  sinceDay: string;
  sourcePolicy: SearchSourcePolicy;
  window?: { since: string; until: string };
};

export type CachedPage = {
  provider?: string;
  logId?: string;
  resultCount: number;
  timeCostMs?: number;
  results: SearchResult[];
};

export type PresentCache = (entry: CacheEntry, usage: BudgetUsage) => SearchPage;

export type CacheEntry = {
  request: CacheRequest;
  fetchedAt: string;
  page: CachedPage;
};

export type BudgetState = {
  version: 1;
  timezoneOffset: string;
  daily: Record<string, number>;
  cache: Record<string, CacheEntry>;
};

export type BudgetLimits = {
  dailyLimit: number;
  monthlyLimit: number;
  timezoneOffset: string;
  cacheTtlMs: number;
};

export type BudgetUsage = {
  dailyUsed: number;
  monthlyUsed: number;
  dailyLimit: number;
  monthlyLimit: number;
};

export type BudgetEvent =
  | {
      readonly _tag: "Reserved";
      readonly day: string;
      readonly dailyUsed: number;
      readonly monthlyUsed: number;
    }
  | { readonly _tag: "CacheHit"; readonly fetchedAt: string }
  | { readonly _tag: "CacheStored"; readonly key: string; readonly fetchedAt: string };

export type BudgetTransition<A> = {
  readonly state: SearchBudget;
  readonly events: readonly BudgetEvent[];
  readonly value: A;
};

export type HashText = (material: string) => string;

export type Reservation = {
  usage: BudgetUsage;
  cached?: SearchPage;
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
    const cached = findCache(this.persisted, request, instant.getTime(), this.limits.cacheTtlMs);
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

export function validateBudgetOptions(options: {
  dailyLimit: number;
  monthlyLimit: number;
  cacheTtlMs: number;
  stateFile: string;
  timezoneOffset: string;
}): void {
  if (
    !Number.isSafeInteger(options.dailyLimit) ||
    options.dailyLimit < 0 ||
    !Number.isSafeInteger(options.monthlyLimit) ||
    options.monthlyLimit < 0 ||
    !Number.isSafeInteger(options.cacheTtlMs) ||
    options.cacheTtlMs < 0 ||
    options.stateFile.trim() === ""
  ) {
    throw new Error("News search budgets, cache TTL and state file must be valid.");
  }
  parseOffsetMilliseconds(options.timezoneOffset);
}

export function cacheKeyMaterial(request: CacheRequest): string {
  return JSON.stringify([
    request.provider,
    request.query,
    request.count,
    request.day,
    request.sinceDay,
    request.sourcePolicy,
    ...(request.window ? [request.window.since, request.window.until] : []),
  ]);
}

export function cacheKey(request: CacheRequest, hash: HashText): string {
  return hash(cacheKeyMaterial(request));
}

export function usageFor(state: BudgetState, instant: Date, limits: BudgetLimits): BudgetUsage {
  const day = calendarDayAtOffset(instant.toISOString(), limits.timezoneOffset);
  const monthlyUsed = Object.entries(state.daily)
    .filter(([recordDay]) => recordDay.startsWith(day.slice(0, 7)))
    .reduce((total, [, used]) => total + used, 0);
  if (!Number.isSafeInteger(monthlyUsed)) {
    throw new NewsSearchError(
      "local_budget_state",
      "Local search budget contains an invalid monthly total.",
    );
  }
  return {
    dailyUsed: state.daily[day] ?? 0,
    monthlyUsed,
    dailyLimit: limits.dailyLimit,
    monthlyLimit: limits.monthlyLimit,
  };
}

export function findCache(
  state: BudgetState,
  request: CacheRequest,
  instant: number,
  ttlMs: number,
): CacheEntry | undefined {
  return Object.values(state.cache)
    .filter(
      (entry) =>
        isFresh(entry, instant, ttlMs) &&
        entry.request.provider === request.provider &&
        entry.request.query === request.query &&
        entry.request.count === request.count &&
        entry.request.sourcePolicy === request.sourcePolicy &&
        entry.request.window?.since === request.window?.since &&
        entry.request.window?.until === request.window?.until &&
        entry.request.sinceDay <= request.sinceDay &&
        entry.request.day >= request.day,
    )
    .sort((left, right) => Date.parse(right.fetchedAt) - Date.parse(left.fetchedAt))[0];
}

export function isFresh(entry: CacheEntry, instant: number, ttlMs: number): boolean {
  const age = instant - Date.parse(entry.fetchedAt);
  return age >= 0 && age < ttlMs;
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

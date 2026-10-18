import { calendarDayAtOffset } from "../../../../kernel/time.js";
import { NewsSearchError } from "../../search/index.js";
import {
  type BudgetLimits,
  type BudgetState,
  type BudgetUsage,
  type CacheEntry,
  type CacheRequest,
} from "../value-objects/budget.js";

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

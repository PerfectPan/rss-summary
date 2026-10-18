import { calendarDayAtOffset } from "../../../../kernel/time.js";
import { NewsSearchError } from "../../search/index.js";
import type { BudgetLimits, BudgetState, BudgetUsage } from "../value-objects/budget.js";

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

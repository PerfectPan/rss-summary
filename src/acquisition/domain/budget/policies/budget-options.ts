import { parseOffsetMilliseconds } from "../../../../kernel/time.js";

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

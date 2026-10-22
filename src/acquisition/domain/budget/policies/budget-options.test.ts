import { expect, it } from "vite-plus/test";

import { validateBudgetOptions } from "./budget-options.js";

it("rejects blank budget options", () => {
  expect(() =>
    validateBudgetOptions({
      dailyLimit: 1,
      monthlyLimit: 1,
      cacheTtlMs: 0,
      stateFile: " ",
      timezoneOffset: "+08:00",
    }),
  ).toThrow("News search budgets, cache TTL and state file must be valid.");
});

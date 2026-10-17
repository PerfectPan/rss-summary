import { expect, it } from "vite-plus/test";

import { searchBudgetDefaults } from "../../../src/acquisition/application/budget-defaults.js";

it("keeps the historical search allowance in one place", () => {
  expect(searchBudgetDefaults).toEqual({
    grok: { dailyLimit: 4, monthlyLimit: 120 },
    doubao: { dailyLimit: 14, monthlyLimit: 420 },
    cacheTtlMinutes: 360,
    stateFile: ".state/news-search.json",
  });
});

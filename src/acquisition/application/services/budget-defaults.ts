/**
 * One copy of the historical search allowance. Callers may still override it
 * from the environment; the deepseek caps check their own separate ledger.
 */
export const searchBudgetDefaults = {
  grok: { dailyLimit: 4, monthlyLimit: 120 },
  doubao: { dailyLimit: 14, monthlyLimit: 420 },
  deepseek: { dailyLimit: 14, monthlyLimit: 420 },
  cacheTtlMinutes: 360,
  stateFile: ".state/news-search.json",
} as const;

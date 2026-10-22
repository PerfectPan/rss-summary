import { resolve } from "node:path";
import { Schema } from "effect";

import { withBudget, type BudgetedSearch } from "../../application/services/with-budget.js";
import {
  cacheablePage,
  normalizeHttpProvider,
  presentCachedPage,
} from "../../domain/budget/index.js";
import {
  validateBudgetOptions,
  type BudgetLimits,
  type CachedPage,
} from "../../domain/budget/index.js";
import type { SearchInput, SearchPage } from "../../domain/search/index.js";
import { pageRepresentable, rawPageSchema } from "../models/news-search.js";
import {
  loadSearchBudget,
  saveSearchBudget,
  sha256,
  withSearchBudgetLock,
} from "../repository/search-budget-file.js";

export type BudgetOptions = {
  stateFile: string;
  dailyLimit: number;
  monthlyLimit: number;
  timezoneOffset: string;
  cacheTtlMs: number;
  provider: string;
  search: (input: SearchInput) => Promise<SearchPage>;
  now?: () => Date;
  /** Provider-declared identity normalization; defaults to the neutral HTTP rule. */
  normalize?: (provider: string) => string;
  /** Provider-declared cacheability; false opts a provider's pages out entirely. */
  cacheable?: boolean;
};

export function createBudgetedNewsSearch(options: BudgetOptions): BudgetedSearch {
  validateBudgetOptions({
    dailyLimit: options.dailyLimit,
    monthlyLimit: options.monthlyLimit,
    cacheTtlMs: options.cacheTtlMs,
    stateFile: options.stateFile,
    timezoneOffset: options.timezoneOffset,
  });
  const stateFile = resolve(options.stateFile);
  const limits: BudgetLimits = {
    dailyLimit: options.dailyLimit,
    monthlyLimit: options.monthlyLimit,
    timezoneOffset: options.timezoneOffset,
    cacheTtlMs: options.cacheTtlMs,
  };
  return withBudget(options.search, {
    stateFile,
    limits,
    provider: options.provider,
    now: options.now ?? (() => new Date()),
    hash: sha256,
    normalize: options.normalize ?? normalizeHttpProvider,
    isCacheable: (page) =>
      (options.cacheable ?? true) && pageRepresentable(page) && cacheablePage(page),
    presentCache: presentCachedPage,
    decodePage: (page) => Schema.decodeUnknownSync(rawPageSchema)(page) as CachedPage,
    load: () => loadSearchBudget(stateFile, limits),
    save: (state) => saveSearchBudget(stateFile, state),
    withLock: (effect) => withSearchBudgetLock(stateFile, effect),
  });
}

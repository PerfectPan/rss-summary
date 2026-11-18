export { isSearchFailure, NewsSearchError } from "./errors/search-failure.js";
export { editionRotation, selectQueryIds, shareSearchBudget } from "./policies/query-rotation.js";
export type {
  MergedSearchSource,
  NativeSearchReceipt,
  NewsSearchInput,
  ProviderFallback,
  SearchFallback,
  SearchHitFields,
  SearchInput,
  SearchPage,
  SearchResult,
  SearchSourcePolicy,
  SearchUsage,
  SourceVerification
} from "./value-objects/search.js";
/** @internal */
export type { NewsSearchPage, NewsSearchResult } from "./value-objects/search.js";

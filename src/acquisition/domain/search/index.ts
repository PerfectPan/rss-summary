export { isSearchFailure, NewsSearchError, type SearchFailure } from "./errors/search-failure.js";
export { editionRotation, selectQueryIds, shareSearchBudget } from "./policies/query-rotation.js";
export type {
  MergedSearchSource,
  NewsSearchInput,
  NewsSearchPage,
  NewsSearchResult,
  ProviderFallback,
  SearchFallback,
  SearchInput,
  SearchPage,
  SearchResult,
  SearchSourcePolicy,
  SearchUsage,
  SourceVerification,
} from "./value-objects/search.js";

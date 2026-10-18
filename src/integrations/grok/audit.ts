import { type NewsSearchError, type SearchPage } from "../../acquisition/index.js";

/** Native-search receipt copied onto a page and onto a failure. */
export type GrokSearchAudit = {
  nativeTools: string[];
  nativeCallCount?: number;
  elapsedMs?: number;
  rejectedResults: number;
  costUsd?: number;
  totalTokens?: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
};

export type AuditedSearchPage = SearchPage & { grok?: GrokSearchAudit };

export function pageAudit(page: SearchPage): GrokSearchAudit | undefined {
  return (page as AuditedSearchPage).grok;
}

export function errorAudit(error: NewsSearchError): GrokSearchAudit | undefined {
  return (error as NewsSearchError & { grok?: GrokSearchAudit }).grok;
}

export function withPageAudit(
  page: SearchPage,
  grok: GrokSearchAudit | undefined,
): AuditedSearchPage {
  return grok ? { ...page, grok } : page;
}

export function clonePageAudit(grok: GrokSearchAudit | undefined): GrokSearchAudit | undefined {
  return grok ? { ...grok, nativeTools: [...grok.nativeTools] } : undefined;
}

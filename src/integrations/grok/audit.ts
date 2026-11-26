import { type NativeSearchReceipt, type NewsSearchError, type SearchPage } from "../../acquisition/index.js";

/** Native-search receipt copied onto a page and onto a failure. */
export type GrokSearchAudit = NativeSearchReceipt;

export type AuditedSearchPage = SearchPage & { grok?: GrokSearchAudit };

export function pageAudit(page: SearchPage): GrokSearchAudit | undefined {
  return (page as AuditedSearchPage).grok;
}

/** @internal */
export function errorAudit(error: NewsSearchError): GrokSearchAudit | undefined {
  return (error as NewsSearchError & { grok?: GrokSearchAudit }).grok;
}

/** @internal */
export function withPageAudit(page: SearchPage, grok: GrokSearchAudit | undefined): AuditedSearchPage {
  return grok ? { ...page, grok } : page;
}

/** @internal */
export function clonePageAudit(grok: GrokSearchAudit | undefined): GrokSearchAudit | undefined {
  return grok ? { ...grok, nativeTools: [...grok.nativeTools] } : undefined;
}

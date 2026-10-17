import { expect, it } from "vite-plus/test";

import {
  clonePageAudit,
  errorAudit,
  pageAudit,
  withPageAudit,
} from "../../../../../src/acquisition/domain/search/adapters/audit.js";
import { NewsSearchError } from "../../../../../src/acquisition/domain/search/search.js";

const grok = { nativeTools: ["x_keyword_search"], rejectedResults: 1 };

it("copies and clones a native-search receipt without sharing the tool list", () => {
  const page = withPageAudit({ resultCount: 0, results: [] }, grok);
  expect(pageAudit(page)).toBe(grok);
  expect(pageAudit({ resultCount: 0, results: [] })).toBeUndefined();

  const failure = new NewsSearchError("grok_timeout", "timed out", { grok });
  expect(errorAudit(failure)).toEqual(grok);

  const clone = clonePageAudit(grok);
  clone?.nativeTools.push("x_thread_fetch");
  expect(grok.nativeTools).toEqual(["x_keyword_search"]);
  expect(clonePageAudit(undefined)).toBeUndefined();
});

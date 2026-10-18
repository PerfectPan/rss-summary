import { describe, expect, it } from "vite-plus/test";

import {
  GitHubActivity,
  GitHubCatalog,
  GrokProcess,
  RssFeed,
  SearchBudgetRepository,
  SearchProvider,
  SourceCatalogStore,
  WebPage,
} from "./ports.js";

describe("acquisition ports", () => {
  it("uses the versioned service keys", () => {
    expect(RssFeed.key).toBe("rss-summary/acquisition/RssFeed/v1");
    expect(WebPage.key).toBe("rss-summary/acquisition/WebPage/v1");
    expect(GitHubActivity.key).toBe("rss-summary/acquisition/GitHubActivity/v1");
    expect(GitHubCatalog.key).toBe("rss-summary/acquisition/GitHubCatalog/v1");
    expect(SourceCatalogStore.key).toBe("rss-summary/acquisition/SourceCatalogStore/v1");
    expect(SearchProvider.key).toBe("rss-summary/acquisition/SearchProvider/v1");
    expect(SearchBudgetRepository.key).toBe("rss-summary/acquisition/SearchBudgetRepository/v1");
    expect(GrokProcess.key).toBe("rss-summary/acquisition/GrokProcess/v1");
  });
});

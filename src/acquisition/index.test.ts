import { describe, expect, it } from "vite-plus/test";

import {
  AcquisitionLive,
  RssClient,
  isDailyAiPaperSource,
  parseFeedXml,
  saveGithubHomeStorageState,
} from "./index.js";

describe("acquisition entry", () => {
  it("re-exports the feed boundary used by the existing callers", () => {
    expect(typeof parseFeedXml).toBe("function");
    expect(typeof isDailyAiPaperSource).toBe("function");
    expect(typeof saveGithubHomeStorageState).toBe("function");
    expect(typeof AcquisitionLive).toBe("function");
    expect(typeof RssClient).toBe("function");
  });
});

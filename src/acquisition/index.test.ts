import { describe, expect, it } from "vite-plus/test";

import { SourceCatalogStoreLive, parseFeedSubscriptions } from "./index.js";

describe("acquisition entry", () => {
  it("re-exports the module boundary the app assembles integrations over", () => {
    expect(typeof parseFeedSubscriptions).toBe("function");
    expect(typeof SourceCatalogStoreLive).toBe("object");
  });
});

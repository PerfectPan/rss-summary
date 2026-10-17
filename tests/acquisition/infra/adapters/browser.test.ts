import { describe, expect, it } from "vite-plus/test";

import {
  readConduitSnapshots,
  readRenderedSnapshots,
  saveLoginStorageState,
} from "../../../../src/acquisition/infra/adapters/browser.js";

describe("browser adapter", () => {
  it("keeps Playwright behind the session boundary", () => {
    expect(typeof readConduitSnapshots).toBe("function");
    expect(typeof readRenderedSnapshots).toBe("function");
    expect(typeof saveLoginStorageState).toBe("function");
  });
});

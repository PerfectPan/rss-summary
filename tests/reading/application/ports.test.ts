import { describe, expect, it } from "vite-plus/test";

import {
  BrowserReader,
  GlmReader,
  HttpReader,
  VideoReader,
} from "../../../src/reading/application/ports.js";

describe("reading ports", () => {
  it("uses the module service keys", () => {
    expect(HttpReader.key).toBe("rss-summary/reading/HttpReader/v1");
    expect(BrowserReader.key).toBe("rss-summary/reading/BrowserReader/v1");
    expect(VideoReader.key).toBe("rss-summary/reading/VideoReader/v1");
    expect(GlmReader.key).toBe("rss-summary/reading/GlmReader/v1");
  });
});

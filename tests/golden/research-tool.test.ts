import { describe, it, vi } from "vite-plus/test";

import { RSS_SUMMARY_RESEARCH_TOOL_ID } from "../../src/app/rivus/plugin.js";
import { ARTICLE_HTML, ARTICLE_URL } from "./fixtures.js";
import {
  executeTool,
  installFetch,
  matchSnapshot,
  registerPlugin,
  textResponse,
  useGoldenHarness,
} from "./harness.js";
import { nextUuid } from "./uuid-sequence.js";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: (() => nextUuid()) as typeof actual.randomUUID };
});

const harness = useGoldenHarness();

describe("golden research tool", () => {
  it("reads an article in http mode", async () => {
    harness.context();
    installFetch((url) => {
      if (url === ARTICLE_URL) return textResponse(ARTICLE_HTML, 200, "text/html");
      throw new Error(`Unexpected fetch ${url}`);
    });
    const { tools } = registerPlugin();
    const result = await executeTool(tools, RSS_SUMMARY_RESEARCH_TOOL_ID, {
      mode: "http",
      ref: `publication:${ARTICLE_URL}`,
      url: ARTICLE_URL,
    });
    await matchSnapshot("research-article-http.txt", result);
  });
});

import { describe, it, vi } from "vite-plus/test";

import {
  INDUSTRY_ATOM,
  INDUSTRY_FEED_URL,
  INDUSTRY_PAGE_HTML,
  INDUSTRY_PAGE_URL,
  WINDOW_SINCE,
  WINDOW_UNTIL,
} from "./fixtures.js";
import {
  installFetch,
  matchSnapshot,
  runCommand,
  textResponse,
  useGoldenHarness,
} from "./harness.js";
import { nextUuid } from "./uuid-sequence.js";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: (() => nextUuid()) as typeof actual.randomUUID };
});

const harness = useGoldenHarness();
const windowArgs = ["--since", WINDOW_SINCE, "--until", WINDOW_UNTIL, "--only-new"];

describe("golden industry", () => {
  it("snapshots the Markdown brief", async () => {
    installIndustryFetch();
    const context = harness.context();
    const markdown = await runCommand(["industry", ...windowArgs], context);
    await matchSnapshot("industry-markdown.txt", markdown, [context.root]);
  });

  it("snapshots the JSON brief", async () => {
    installIndustryFetch();
    const context = harness.context();
    const json = await runCommand(["industry", "--json", ...windowArgs], context);
    await matchSnapshot("industry-json.txt", json, [context.root]);
  });
});

function installIndustryFetch(): void {
  installFetch((url) => {
    if (url === INDUSTRY_FEED_URL) return textResponse(INDUSTRY_ATOM, 200, "application/atom+xml");
    if (url === INDUSTRY_PAGE_URL) return textResponse(INDUSTRY_PAGE_HTML, 200, "text/html");
    throw new Error(`Unexpected fetch ${url}`);
  });
}

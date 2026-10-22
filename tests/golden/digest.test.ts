import { describe, it, vi } from "vite-plus/test";

import {
  GITHUB_REPOSITORY,
  GITHUB_WATCH_EVENT,
  PERSONAL_FEED_URL,
  PERSONAL_RSS,
  WINDOW_SINCE,
  WINDOW_UNTIL,
} from "./fixtures.js";
import {
  installFetch,
  jsonResponse,
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
const windowArgs = ["--since", WINDOW_SINCE, "--until", WINDOW_UNTIL, "--pages", "1"];

describe("golden digest", () => {
  it("snapshots rss-only JSON", async () => {
    installDigestFetch();
    const context = harness.context();
    const capture = await runCommand(["digest", "--rss-only", "--json", ...windowArgs], context);
    await matchSnapshot("digest-rss-only-json.txt", capture, [context.root]);
  });

  it("snapshots rss-only Markdown", async () => {
    installDigestFetch();
    const context = harness.context();
    const capture = await runCommand(["digest", "--rss-only", ...windowArgs], context);
    await matchSnapshot("digest-rss-only-markdown.txt", capture, [context.root]);
  });

  it("snapshots Markdown when GitHub events are mixed with RSS", async () => {
    installDigestFetch();
    const context = harness.context();
    const capture = await runCommand(["digest", ...windowArgs], context);
    await matchSnapshot("digest-events-markdown.txt", capture, [context.root]);
  });

  it("filters already delivered items on the second --only-new run", async () => {
    installDigestFetch();
    const context = harness.context();
    const first = await runCommand(["digest", "--rss-only", "--only-new", ...windowArgs], context);
    const second = await runCommand(["digest", "--rss-only", "--only-new", ...windowArgs], context);
    await matchSnapshot("digest-only-new-first.txt", first, [context.root]);
    await matchSnapshot("digest-only-new-second.txt", second, [context.root]);
  });

  it("does not write seen state on --dry-run", async () => {
    installDigestFetch();
    const context = harness.context();
    const capture = await runCommand(
      ["digest", "--rss-only", "--only-new", "--dry-run", ...windowArgs],
      context,
    );
    await matchSnapshot("digest-dry-run.txt", capture, [context.root]);
  });
});

function installDigestFetch(): void {
  installFetch((url) => {
    if (url === PERSONAL_FEED_URL) return textResponse(PERSONAL_RSS);
    if (url.includes("/received_events")) {
      const page = new URL(url).searchParams.get("page");
      return jsonResponse(page === "1" ? [GITHUB_WATCH_EVENT] : []);
    }
    if (url === "https://api.github.com/repos/example/project")
      return jsonResponse(GITHUB_REPOSITORY);
    if (url.includes("/user/following")) return jsonResponse([]);
    throw new Error(`Unexpected fetch ${url}`);
  });
}

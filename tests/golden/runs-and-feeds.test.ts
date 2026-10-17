import { describe, it, vi } from "vite-plus/test";

import {
  BROKEN_FEED_URL,
  PERSONAL_FEED_URL,
  PERSONAL_FEEDS,
  PERSONAL_RSS,
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

describe("golden runs and feeds", () => {
  it("lists, filters, and shows run artifacts", async () => {
    installFetch((url) => {
      if (url === PERSONAL_FEED_URL) return textResponse(PERSONAL_RSS);
      if (url === BROKEN_FEED_URL) return textResponse("unavailable", 500);
      throw new Error(`Unexpected fetch ${url}`);
    });
    const context = harness.context();
    process.env.RSS_FEEDS = JSON.stringify([
      ...PERSONAL_FEEDS,
      { name: "Broken Feed", url: BROKEN_FEED_URL, tags: ["typescript"] },
    ]);
    const digest = await runCommand(
      ["digest", "--rss-only", "--since", WINDOW_SINCE, "--until", WINDOW_UNTIL, "--pages", "1"],
      context,
    );
    const list = await runCommand(["runs", "list"], context);
    const failures = await runCommand(["runs", "failures"], context);
    const label = Object.keys(digest.state)
      .find((path) => path.endsWith(".json") && path.startsWith("runs/"))
      ?.split("/")
      .at(-1)
      ?.replace(/\.json$/u, "");
    if (!label) throw new Error("digest did not write a run artifact");
    const show = await runCommand(["runs", "show", label], context);
    await matchSnapshot("runs-list-failures-show.txt", { digest, failures, list, show }, [
      context.root,
    ]);
  });

  it("adds, lists, and removes a feed", async () => {
    const context = harness.context();
    const file = `${context.root}/managed-feeds.json`;
    const add = await runCommand(
      [
        "feeds",
        "add",
        "--file",
        file,
        "--url",
        PERSONAL_FEED_URL,
        "--name",
        "Example Feed",
        "--tags",
        "ai,typescript",
      ],
      context,
    );
    const list = await runCommand(["feeds", "list", "--file", file], context);
    const remove = await runCommand(
      ["feeds", "remove", "--file", file, "--url", PERSONAL_FEED_URL],
      context,
    );
    const after = await runCommand(["feeds", "list", "--file", file], context);
    await matchSnapshot("feeds-add-list-remove.txt", { add, after, list, remove }, [context.root]);
  });
});

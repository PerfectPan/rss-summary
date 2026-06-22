import { describe, expect, it } from "vitest";

import { createNotifier } from "../src/notifier.js";

describe("notifier", () => {
  it("posts digest markdown to a generic webhook", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    let stdout = "";
    const notifier = createNotifier({
      webhookUrl: "https://example.test/webhook",
      stdout: {
        write: (chunk: string | Uint8Array) => {
          stdout += String(chunk);
          return true;
        },
      },
      fetch: async (url, init) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return new Response("ok", { status: 200 });
      },
    });

    await notifier.send("# Digest");

    expect(calls).toEqual([
      {
        url: "https://example.test/webhook",
        body: { text: "# Digest" },
      },
    ]);
    expect(stdout).toBe("# Digest\n");
  });
});

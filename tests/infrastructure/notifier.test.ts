import { describe, expect, it } from "vite-plus/test";

import { createNotifier } from "../../src/infrastructure/notifier.js";

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

  it("appends a trailing newline when markdown has none", async () => {
    let stdout = "";
    const notifier = createNotifier({
      stdout: {
        write: (chunk: string | Uint8Array) => {
          stdout += String(chunk);
          return true;
        },
      },
    });

    await notifier.send("# Digest");

    expect(stdout).toBe("# Digest\n");
  });

  it("fails when the webhook responds non-OK", async () => {
    const notifier = createNotifier({
      webhookUrl: "https://example.test/webhook",
      stdout: { write: () => true },
      fetch: async () => new Response("boom", { status: 500 }),
    });

    await expect(notifier.send("# Digest")).rejects.toThrow(/500 boom/);
  });
});

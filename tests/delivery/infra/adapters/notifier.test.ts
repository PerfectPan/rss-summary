import { describe, expect, it } from "vite-plus/test";
import { Effect } from "effect";

import { Notifier, NotifierLive } from "../../../../src/delivery/index.js";

describe("notifier", () => {
  it("posts digest markdown to a generic webhook", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    let stdout = "";

    await send(
      {
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
      },
      "# Digest",
    );

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

    await send(
      {
        stdout: {
          write: (chunk: string | Uint8Array) => {
            stdout += String(chunk);
            return true;
          },
        },
      },
      "# Digest",
    );

    expect(stdout).toBe("# Digest\n");
  });

  it("fails when the webhook responds non-OK", async () => {
    await expect(
      send(
        {
          webhookUrl: "https://example.test/webhook",
          stdout: { write: () => true },
          fetch: async () => new Response("boom", { status: 500 }),
        },
        "# Digest",
      ),
    ).rejects.toThrow(/500 boom/);
  });
});

function send(options: Parameters<typeof NotifierLive>[0], markdown: string): Promise<void> {
  return Effect.runPromise(
    Effect.provide(
      Notifier.use((notifier) => notifier.send(markdown)),
      NotifierLive(options),
    ),
  );
}

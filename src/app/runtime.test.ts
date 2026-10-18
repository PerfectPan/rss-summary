import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { runCliEffect, runPluginEffect } from "./runtime.js";

describe("app/runtime", () => {
  it("returns 0 and writes nothing when the effect succeeds", async () => {
    const writes: string[] = [];
    const code = await runCliEffect(Effect.void, {
      stderr: {
        write(chunk: string) {
          writes.push(chunk);
        },
      },
    });

    expect(code).toBe(0);
    expect(writes).toEqual([]);
  });

  it("returns 1 and writes the error message when the effect fails", async () => {
    const writes: string[] = [];
    const code = await runCliEffect(Effect.fail(new Error("boom")), {
      stderr: {
        write(chunk: string) {
          writes.push(chunk);
        },
      },
    });

    expect(code).toBe(1);
    expect(writes).toEqual(["boom\n"]);
  });

  it("resolves a plugin effect and rejects its failure", async () => {
    await expect(runPluginEffect(Effect.succeed(7))).resolves.toBe(7);
    await expect(runPluginEffect(Effect.fail(new Error("boom")))).rejects.toThrow("boom");
  });
});

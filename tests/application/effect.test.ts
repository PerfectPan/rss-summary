import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { attempt } from "../../src/application/effect.js";

describe("application/effect attempt", () => {
  it("lifts a resolved promise into the success channel", async () => {
    await expect(Effect.runPromise(attempt(Promise.resolve(42)))).resolves.toBe(42);
  });

  it("maps thrown values onto the typed Error channel", async () => {
    await expect(Effect.runPromise(attempt(Promise.reject(new Error("boom"))))).rejects.toThrow("boom");
    await expect(Effect.runPromise(attempt(Promise.reject("string-cause")))).rejects.toThrow("string-cause");
  });
});

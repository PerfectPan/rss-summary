import { describe, expect, it } from "vite-plus/test";

import { err, isErr, isOk, ok } from "../../src/kernel/result.js";

describe("kernel/result", () => {
  it("builds Ok and Err values and narrows them", () => {
    const success = ok(1);
    const failure = err("nope");

    expect(success).toEqual({ _tag: "Ok", value: 1 });
    expect(failure).toEqual({ _tag: "Err", error: "nope" });
    expect(isOk(success)).toBe(true);
    expect(isErr(success)).toBe(false);
    expect(isOk(failure)).toBe(false);
    expect(isErr(failure)).toBe(true);
    if (isOk(success)) expect(success.value).toBe(1);
    if (isErr(failure)) expect(failure.error).toBe("nope");
  });
});

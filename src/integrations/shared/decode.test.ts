import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { decodeSchema } from "./decode.js";

const documentSchema = Schema.Struct({ url: Schema.String });

describe("decodeSchema", () => {
  it("returns the decoded document or a kernel failure", () => {
    expect(decodeSchema(documentSchema, { url: "https://example.com", extra: true })).toEqual({
      _tag: "Ok",
      value: { url: "https://example.com" },
    });
    const failed = decodeSchema(documentSchema, { url: 1 });
    expect(failed._tag).toBe("Err");
    if (failed._tag === "Err") {
      expect(failed.error).toEqual({
        _tag: "DecodeFailure",
        message: "The payload did not match the expected document.",
      });
    }
  });
});

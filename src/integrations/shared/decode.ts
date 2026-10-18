import { Schema } from "effect";

import { err, ok, type Result } from "../../kernel/result.js";

export type DecodeFailure = {
  readonly _tag: "DecodeFailure";
  readonly message: string;
};

export function decodeSchema<S extends Schema.Decoder<unknown>>(
  schema: S,
  input: unknown,
): Result<S["Type"], DecodeFailure> {
  const decoded = Schema.decodeUnknownResult(schema)(input);
  if (decoded._tag === "Success") return ok(decoded.success);
  return err({
    _tag: "DecodeFailure",
    message: "The payload did not match the expected document.",
  });
}

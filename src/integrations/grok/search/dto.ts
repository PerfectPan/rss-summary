import { Schema } from "effect";

/** One native-search post as the CLI contract requires it. */
export const postSchema = Schema.Struct({
  url: Schema.String,
  author: Schema.String,
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(300)),
  summary: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2000)),
  publishedAt: Schema.String,
});
const responseSchema = Schema.Struct({
  posts: Schema.Array(Schema.Unknown).check(Schema.isMaxLength(50)),
});
const nativeToolNames = new Set(["x_keyword_search", "x_semantic_search", "x_thread_fetch"]);

export const grokRequestSchema = Schema.Struct({
  instruction: Schema.String.check(Schema.isMinLength(1)),
  count: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 })),
  since: Schema.String.check(
    Schema.makeFilter(
      (value: string) =>
        /(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value)),
    ),
  ),
  until: Schema.String.check(
    Schema.makeFilter(
      (value: string) =>
        /(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value)),
    ),
  ),
  handle: Schema.optional(Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_]{1,15}$/u))),
});

export type GrokRequest = typeof grokRequestSchema.Type;

export { responseSchema };

export function isNativeCall(
  event: Record<string, unknown>,
): event is Record<string, unknown> & { toolCallId: string } {
  return (
    event.type === "tool_call" &&
    isRecord(event.rawInput) &&
    event.rawInput.variant === "XSearch" &&
    event.rawInput.backend === true &&
    typeof event.toolCallId === "string"
  );
}

export function isNativeReceipt(
  event: Record<string, unknown>,
  calls: Set<string>,
): event is Record<string, unknown> & { rawOutput: { name: string } } {
  return (
    event.type === "tool_call_update" &&
    typeof event.toolCallId === "string" &&
    calls.has(event.toolCallId) &&
    event.status === "completed" &&
    isRecord(event.rawOutput) &&
    typeof event.rawOutput.name === "string" &&
    nativeToolNames.has(event.rawOutput.name)
  );
}

const objectCtorString = Function.prototype.toString.call(Object);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Object.prototype.toString.call(value) !== "[object Object]") return false;
  const proto: object | null = Object.getPrototypeOf(value);
  if (proto === null) return true;
  const ctor = Object.prototype.hasOwnProperty.call(proto, "constructor") && proto.constructor;
  return (
    typeof ctor === "function" &&
    ctor instanceof ctor &&
    Function.prototype.toString.call(ctor) === objectCtorString
  );
}

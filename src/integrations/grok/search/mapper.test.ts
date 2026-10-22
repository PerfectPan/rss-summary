import { expect, it } from "vite-plus/test";

import { isNativeCall, isNativeReceipt } from "./dto.js";
import { parseGrokStream } from "./mapper.js";

const publishedAt = "2026-08-16T04:00:00.000Z";
const postId = ((BigInt(Date.parse(publishedAt)) - 1288834974657n) << 22n).toString();
const since = Date.parse("2026-08-15T16:00:00.000Z");
const until = Date.parse("2026-08-16T16:00:00.000Z");

function stream(posts: unknown[]): string {
  return [
    { type: "tool_call", toolCallId: "native", rawInput: { variant: "XSearch", backend: true } },
    {
      type: "tool_call_update",
      toolCallId: "native",
      status: "completed",
      rawOutput: { name: "x_keyword_search" },
    },
    { type: "text", data: JSON.stringify({ posts }) },
    { type: "end", stopReason: "end_turn" },
  ]
    .map((event) => JSON.stringify(event))
    .join("\n");
}

it("accepts a native call receipt and rejects a plain object", () => {
  const call = {
    type: "tool_call",
    toolCallId: "native",
    rawInput: { variant: "XSearch", backend: true },
  };
  expect(isNativeCall(call)).toBe(true);
  expect(isNativeCall({})).toBe(false);
  const calls = new Set(["native"]);
  expect(
    isNativeReceipt(
      {
        type: "tool_call_update",
        toolCallId: "native",
        status: "completed",
        rawOutput: { name: "x_keyword_search" },
      },
      calls,
    ),
  ).toBe(true);
  expect(isNativeReceipt({ type: "tool_call_update", toolCallId: "other" }, calls)).toBe(false);
});

it("parses a completed native stream into an unrated post and leaves elapsed time unset", () => {
  const acquired = parseGrokStream(
    stream([
      {
        url: `https://x.com/OpenAI/status/${postId}`,
        author: "OpenAI",
        title: "发布",
        summary: "模型发布。",
        publishedAt,
      },
    ]),
    1,
    since,
    until,
  );
  expect(acquired.page.provider).toBe("grok");
  expect(acquired.page.grok?.elapsedMs).toBeUndefined();
  expect(acquired.page.results[0]).toMatchObject({
    id: postId,
    url: `https://x.com/openai/status/${postId}`,
    authInfoLevel: 4,
    siteName: "@OpenAI · X（Grok 整理）",
  });
  expect(acquired.items[0]).toMatchObject({
    kind: "post",
    credibility: { tier: "unrated" },
    provenance: { note: "Grok 原生 X 搜索，内容经模型整理；未独立核验作者或原文" },
  });
});

it("rejects a stream that has no native receipt", () => {
  expect(() => parseGrokStream("{}", 1, since, until)).toThrow(
    "Grok response lacks a completed native X search receipt, valid completion or structured results.",
  );
});

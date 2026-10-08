import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { GrokSearchClient } from "../../src/infrastructure/grok-search.js";
import type { NewsSearchInput } from "../../src/infrastructure/news-search.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
const input: NewsSearchInput = {
  query: "OpenAI release",
  day: "2026-10-08",
  count: 3,
  sourcePolicy: "news",
};
const publishedAt = "2026-10-08T01:00:00.000Z";
const postId = ((BigInt(Date.parse(publishedAt)) - 1288834974657n) << 22n).toString();
const post = {
  url: `https://x.com/OpenAI/status/${postId}?s=20`,
  author: "@OpenAI",
  title: "OpenAI 正式发布模型",
  summary: "OpenAI 发布模型。",
  publishedAt,
};
function stream(posts: unknown[] = [post]): Record<string, unknown>[] {
  return [
    { type: "text", data: "I will search X." },
    { type: "thought", data: "private reasoning must not enter the result" },
    { type: "tool_call", toolCallId: "native", rawInput: { variant: "XSearch", backend: true } },
    {
      type: "tool_call_update",
      toolCallId: "native",
      status: "completed",
      rawOutput: { name: "x_keyword_search" },
    },
    { type: "text", data: JSON.stringify({ posts }) },
    {
      type: "end",
      stopReason: "end_turn",
      usage: {
        total_tokens: 200,
        input_tokens: 80,
        cache_read_input_tokens: 100,
        output_tokens: 20,
      },
      total_cost_usd: 0.001,
    },
  ];
}
async function fixture(output: string | Record<string, unknown>[], extraScript = "") {
  const directory = await mkdtemp(join(tmpdir(), "grok-test-"));
  directories.push(directory);
  const executable = join(directory, "grok");
  const capture = join(directory, "args.json");
  const stdout =
    typeof output === "string" ? output : output.map((event) => JSON.stringify(event)).join("\n");
  await writeFile(
    executable,
    `#!${process.execPath}\nconst fs = require('node:fs'); fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()})); ${extraScript || `process.stdout.write(${JSON.stringify(stdout)});`}`,
    { mode: 0o700 },
  );
  return { executable, capture };
}
async function search(output: string | Record<string, unknown>[], request = input) {
  const { executable } = await fixture(output);
  return new GrokSearchClient({ executable, timezoneOffset: "+08:00" }).search(request);
}

describe("native Grok X search", () => {
  it("requires real tool receipts, canonicalizes posts and retains only usage metadata", async () => {
    const { executable, capture } = await fixture(stream());
    const page = await new GrokSearchClient({
      executable,
      model: "grok-test",
      timezoneOffset: "+08:00",
    }).search(input);
    expect(page).toMatchObject({
      provider: "grok",
      grok: {
        nativeTools: ["x_keyword_search"],
        rejectedResults: 0,
        costUsd: 0.001,
        totalTokens: 200,
        inputTokens: 80,
        cachedInputTokens: 100,
        outputTokens: 20,
      },
      results: [
        {
          url: `https://x.com/openai/status/${postId}`,
          authInfoLevel: 4,
          publishTime: publishedAt,
        },
      ],
    });
    expect(JSON.stringify(page)).not.toContain("private reasoning");
    const invocation = JSON.parse(await readFile(capture, "utf8")) as {
      args: string[];
      cwd: string;
    };
    expect(invocation.args).toEqual(
      expect.arrayContaining([
        "--tools",
        "x_search",
        "--no-subagents",
        "--max-turns",
        "2",
        "--permission-mode",
        "dontAsk",
        "--model",
        "grok-test",
      ]),
    );
    expect(invocation.args[1]).toContain("since:2026-10-07 until:2026-10-09");
    await expect(stat(invocation.cwd)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["x_semantic_search", "x_thread_fetch"])(
    "accepts a completed native %s call and fenced JSON",
    async (name) => {
      const events = stream();
      events[3]!.rawOutput = { name };
      events[4]!.data = `\`\`\`json\n${String(events[4]!.data)}\n\`\`\``;
      expect((await search(events)).grok?.nativeTools).toEqual([name]);
    },
  );

  it.each([
    [
      "no tool",
      (events: Record<string, unknown>[]) =>
        events.filter((event) => !String(event.type).startsWith("tool_")),
    ],
    [
      "non-native tool",
      (events: Record<string, unknown>[]) => {
        events[2]!.rawInput = { variant: "XSearch", backend: false };
        return events;
      },
    ],
    [
      "unmatched receipt",
      (events: Record<string, unknown>[]) => {
        events[3]!.toolCallId = "other";
        return events;
      },
    ],
    [
      "failed tool",
      (events: Record<string, unknown>[]) => {
        events[3]!.status = "failed";
        return events;
      },
    ],
    [
      "unknown tool",
      (events: Record<string, unknown>[]) => {
        events[3]!.rawOutput = { name: "web_search" };
        return events;
      },
    ],
    ["truncated stream", (events: Record<string, unknown>[]) => events.slice(0, -1)],
    [
      "turn limit",
      (events: Record<string, unknown>[]) => {
        events[5]!.stopReason = "max_turns";
        return events;
      },
    ],
    [
      "invalid JSON",
      (events: Record<string, unknown>[]) => {
        events[4]!.data = "Found a post";
        return events;
      },
    ],
    [
      "extra events",
      (events: Record<string, unknown>[]) => [...events, { type: "text", data: "after end" }],
    ],
  ])("rejects %s", async (_name, edit) => {
    await expect(search(edit(stream()))).rejects.toMatchObject({ code: "grok_invalid_response" });
  });

  it.each(["not JSON", "null", JSON.stringify({ type: "end", stopReason: "end_turn" })])(
    "rejects invalid stream %s",
    async (output) => {
      await expect(search(output)).rejects.toMatchObject({ code: "grok_invalid_response" });
    },
  );

  it("rejects malformed, duplicate, mismatched, off-site and out-of-window posts", async () => {
    const oldTime = "2026-10-06T01:00:00Z";
    const oldId = ((BigInt(Date.parse(oldTime)) - 1288834974657n) << 22n).toString();
    const page = await search(
      stream([
        post,
        post,
        {},
        { ...post, author: "someone_else" },
        { ...post, url: `https://evil.example/OpenAI/status/${postId}` },
        { ...post, url: `https://user:secret@x.com/OpenAI/status/${postId}` },
        { ...post, url: `https://x.com/i/status/${postId}` },
        { ...post, publishedAt: oldTime },
        { ...post, publishedAt: "not-a-date" },
        { ...post, publishedAt: "2026-10-08T01:00:00" },
        { ...post, url: `https://x.com/OpenAI/status/${oldId}`, publishedAt: oldTime },
      ]),
    );
    expect(page.results).toHaveLength(1);
    expect(page.grok?.rejectedResults).toBe(10);
  });

  it("preserves valid empty search results and ignores invalid usage", async () => {
    const events = stream([]);
    events[5]!.usage = { total_tokens: -1, input_tokens: "secret", cache_read_input_tokens: null };
    events[5]!.total_cost_usd = "not reported";
    const page = await search(events);
    expect(page.results).toEqual([]);
    expect(page.grok?.costUsd).toBeUndefined();
    expect(page.grok?.totalTokens).toBeUndefined();
  });

  it("supports catch-up dates and caps results", async () => {
    const otherId = (BigInt(postId) + 1n).toString();
    const page = await search(
      stream([post, { ...post, url: `https://twitter.com/OpenAI/status/${otherId}` }]),
      { ...input, count: 1, sinceDay: "2026-10-07" },
    );
    expect(page.resultCount).toBe(2);
    expect(page.results).toHaveLength(1);
  });

  it("rejects strict source policies before launching the CLI", async () => {
    await expect(
      new GrokSearchClient({ executable: "/missing-grok", timezoneOffset: "+08:00" }).search({
        ...input,
        sourcePolicy: "official",
      }),
    ).rejects.toMatchObject({ code: "grok_source_policy" });
  });

  it.each([
    ["process failure", "process.stderr.write('private token'); process.exit(1);", 1000],
    ["timeout", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);", 100],
    ["output limit", "process.stdout.write('x'.repeat(3 * 1024 * 1024));", 1000],
  ])("redacts %s", async (_name, script, timeoutMs) => {
    const { executable } = await fixture("", script);
    await expect(
      new GrokSearchClient({ executable, timeoutMs, timezoneOffset: "+08:00" }).search(input),
    ).rejects.toMatchObject({
      code: "grok_cli_failed",
      message: expect.not.stringContaining("private token"),
    });
  });
});

it.each([
  ["wrong date", { ...post, publishedAt: "2026-10-07T01:00:00Z" }],
  ["no timezone", { ...post, publishedAt: "2026-10-08T01:00:00" }],
  ["invalid date", { ...post, publishedAt: "not a date" }],
  ["author mismatch", { ...post, author: "other" }],
  ["off-site URL", { ...post, url: `https://evil.example/OpenAI/status/${postId}` }],
])("drops a lone post with %s", async (_name, candidate) => {
  const page = await search(stream([candidate]));
  expect(page.results).toEqual([]);
  expect(page.grok?.rejectedResults).toBe(1);
});

it("filters exact local day boundaries even when UTC discovery spans two days", async () => {
  const times = [
    "2026-10-07T15:59:59Z",
    "2026-10-07T16:00:00Z",
    "2026-10-08T15:59:59Z",
    "2026-10-08T16:00:00Z",
  ];
  const posts = times.map((time) => ({
    ...post,
    publishedAt: time,
    url: `https://x.com/OpenAI/status/${(BigInt(Date.parse(time)) - 1288834974657n) << 22n}`,
  }));
  const page = await search(stream(posts));
  expect(page.results.map((result) => result.publishTime)).toEqual([
    "2026-10-07T16:00:00.000Z",
    "2026-10-08T15:59:59.000Z",
  ]);
  expect(page.grok?.rejectedResults).toBe(2);
});

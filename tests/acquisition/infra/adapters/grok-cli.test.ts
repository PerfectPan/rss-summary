import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { SearchProvider } from "../../../../src/acquisition/application/ports.js";
import {
  GrokSearchClient,
  GrokSearchLive,
  GrokXClient,
} from "../../../../src/acquisition/infra/adapters/grok-cli.js";
import type { NewsSearchInput } from "../../../../src/acquisition/domain/search/search.js";
import { describeSearchProvider } from "./search-provider-suite.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
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

const input = {
  instruction: "Collect from:OpenAI",
  handle: "OpenAI",
  count: 30,
  since: publishedAt,
  until: "2026-10-09T01:00:00.000Z",
};
describe("shared X transport", () => {
  it("aborts a third backend search before waiting for the overall timeout and removes its cwd", async () => {
    const events = [1, 2, 3].map((id) => ({
      type: "tool_call",
      toolCallId: String(id),
      rawInput: { variant: "XSearch", backend: true },
    }));
    const { executable, capture } = await fixture(
      "",
      `process.stdout.write(${JSON.stringify(events.map((event) => JSON.stringify(event)).join("\n") + "\n")}); setInterval(() => {}, 1000);`,
    );
    const start = Date.now();
    await expect(
      new GrokXClient({ executable, timeoutMs: 30_000 }).search(input),
    ).rejects.toMatchObject({
      code: "grok_call_limit",
      grok: { nativeCallCount: 3, nativeTools: [], elapsedMs: expect.any(Number) },
    });
    expect(Date.now() - start).toBeLessThan(5000);
    const { cwd } = JSON.parse(await readFile(capture, "utf8"));
    await expect(stat(cwd)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("allows a keyword search and one thread fetch, counting repeated receipt IDs once", async () => {
    const events = stream();
    const call = {
      type: "tool_call",
      toolCallId: "thread",
      rawInput: { variant: "XSearch", backend: true },
    };
    events.splice(events.length - 2, 0, call, call, {
      type: "tool_call_update",
      toolCallId: "thread",
      status: "completed",
      rawOutput: { name: "x_thread_fetch" },
    });
    const { executable } = await fixture(events);
    const page = await new GrokXClient({ executable }).search(input);
    expect(page.grok).toMatchObject({
      nativeCallCount: 2,
      nativeTools: ["x_keyword_search", "x_thread_fetch"],
    });
    expect(page.results).toHaveLength(1);
  });

  it("reports a missing executable without including private process details", async () => {
    await expect(
      new GrokXClient({ executable: "/nonexistent-grok" }).search(input),
    ).rejects.toMatchObject({ code: "grok_not_found" });
  });
  it("rejects matching-topic posts by other authors and exact end-boundary posts", async () => {
    const endId = ((BigInt(Date.parse(input.until)) - 1288834974657n) << 22n).toString();
    const { executable } = await fixture(
      stream([
        { ...post, author: "Other", url: `https://x.com/Other/status/${postId}` },
        post,
        { ...post, url: `https://x.com/OpenAI/status/${endId}`, publishedAt: input.until },
      ]),
    );
    const page = await new GrokXClient({ executable }).search(input);
    expect(page.results).toHaveLength(1);
    expect(page.results[0]).toMatchObject({ id: postId, authInfoLevel: 4 });
    expect(page.grok?.rejectedResults).toBe(2);
  });

  it("widens UTC discovery while requesting an exact intraday window", async () => {
    const { executable, capture } = await fixture(stream());
    await new GrokXClient({ executable }).search(input);
    const invocation = JSON.parse(await readFile(capture, "utf8"));
    expect(invocation.args[1]).toContain("since:2026-10-08 until:2026-10-10");
    expect(invocation.args[1]).toContain(`${input.until} exclusive`);
  });

  it.each([
    { handle: "OpenAI OR from:other" },
    { count: 0 },
    { count: 51 },
    { since: "invalid" },
    { since: input.until },
    { until: "2026-10-07T01:00:00Z" },
  ])("rejects invalid collection input before launching the CLI: %o", async (change) => {
    await expect(
      new GrokXClient({ executable: "/nonexistent" }).search({ ...input, ...change }),
    ).rejects.not.toMatchObject({ code: "grok_cli_failed" });
  });
});

const topicDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    topicDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
const topicInput: NewsSearchInput = {
  query: "OpenAI release",
  day: "2026-10-08",
  count: 3,
  sourcePolicy: "news",
};
const topicPublishedAt = "2026-10-08T01:00:00.000Z";
const topicPostId = ((BigInt(Date.parse(topicPublishedAt)) - 1288834974657n) << 22n).toString();
const topicPost = {
  url: `https://x.com/OpenAI/status/${topicPostId}?s=20`,
  author: "@OpenAI",
  title: "OpenAI 正式发布模型",
  summary: "OpenAI 发布模型。",
  publishedAt: topicPublishedAt,
};
function topicStream(posts: unknown[] = [topicPost]): Record<string, unknown>[] {
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
async function topicFixture(output: string | Record<string, unknown>[], extraScript = "") {
  const directory = await mkdtemp(join(tmpdir(), "grok-test-"));
  topicDirectories.push(directory);
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
async function search(output: string | Record<string, unknown>[], request = topicInput) {
  const { executable } = await topicFixture(output);
  return new GrokSearchClient({ executable, timezoneOffset: "+08:00" }).search(request);
}

describe("native Grok X search", () => {
  it("requires real tool receipts, canonicalizes posts and retains only usage metadata", async () => {
    const { executable, capture } = await topicFixture(topicStream());
    const page = await new GrokSearchClient({
      executable,
      model: "grok-test",
      timezoneOffset: "+08:00",
    }).search(topicInput);
    expect(page).toMatchObject({
      provider: "grok",
      grok: {
        nativeTools: ["x_keyword_search"],
        nativeCallCount: 1,
        elapsedMs: expect.any(Number),
        rejectedResults: 0,
        costUsd: 0.001,
        totalTokens: 200,
        inputTokens: 80,
        cachedInputTokens: 100,
        outputTokens: 20,
      },
      results: [
        {
          url: `https://x.com/openai/status/${topicPostId}`,
          authInfoLevel: 4,
          publishTime: topicPublishedAt,
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
        "--no-plan",
        "--reasoning-effort",
        "low",
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
      const events = topicStream();
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
    ["truncated topicStream", (events: Record<string, unknown>[]) => events.slice(0, -1)],
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
    await expect(search(edit(topicStream()))).rejects.toMatchObject({
      code: "grok_invalid_response",
    });
  });

  it.each(["not JSON", "null", JSON.stringify({ type: "end", stopReason: "end_turn" })])(
    "rejects invalid topicStream %s",
    async (output) => {
      await expect(search(output)).rejects.toMatchObject({ code: "grok_invalid_response" });
    },
  );

  it("rejects malformed, duplicate, mismatched, off-site and out-of-window posts", async () => {
    const oldTime = "2026-10-06T01:00:00Z";
    const oldId = ((BigInt(Date.parse(oldTime)) - 1288834974657n) << 22n).toString();
    const page = await search(
      topicStream([
        topicPost,
        topicPost,
        {},
        { ...topicPost, author: "someone_else" },
        { ...topicPost, url: `https://evil.example/OpenAI/status/${topicPostId}` },
        { ...topicPost, url: `https://user:secret@x.com/OpenAI/status/${topicPostId}` },
        { ...topicPost, url: `https://x.com/i/status/${topicPostId}` },
        { ...topicPost, publishedAt: oldTime },
        { ...topicPost, publishedAt: "not-a-date" },
        { ...topicPost, publishedAt: "2026-10-08T01:00:00" },
        { ...topicPost, url: `https://x.com/OpenAI/status/${oldId}`, publishedAt: oldTime },
      ]),
    );
    expect(page.results).toHaveLength(1);
    expect(page.grok?.rejectedResults).toBe(10);
  });

  it("preserves valid empty search results and ignores invalid usage", async () => {
    const events = topicStream([]);
    events[5]!.usage = { total_tokens: -1, input_tokens: "secret", cache_read_input_tokens: null };
    events[5]!.total_cost_usd = "not reported";
    const page = await search(events);
    expect(page.results).toEqual([]);
    expect(page.grok?.costUsd).toBeUndefined();
    expect(page.grok?.totalTokens).toBeUndefined();
  });

  it("supports catch-up dates and caps results", async () => {
    const otherId = (BigInt(topicPostId) + 1n).toString();
    const page = await search(
      topicStream([
        topicPost,
        { ...topicPost, url: `https://twitter.com/OpenAI/status/${otherId}` },
      ]),
      { ...topicInput, count: 1, sinceDay: "2026-10-07" },
    );
    expect(page.resultCount).toBe(2);
    expect(page.results).toHaveLength(1);
  });

  it("rejects strict source policies before launching the CLI", async () => {
    await expect(
      new GrokSearchClient({ executable: "/missing-grok", timezoneOffset: "+08:00" }).search({
        ...topicInput,
        sourcePolicy: "official",
      }),
    ).rejects.toMatchObject({ code: "grok_source_policy" });
  });

  it.each([
    [
      "process failure",
      "process.stderr.write('private token'); process.exit(1);",
      1000,
      "grok_cli_failed",
    ],
    [
      "timeout",
      "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);",
      100,
      "grok_timeout",
    ],
    [
      "output limit",
      "process.stdout.write('x'.repeat(3 * 1024 * 1024));",
      1000,
      "grok_output_limit",
    ],
  ] as const)(
    "redacts %s while preserving the failure category",
    async (_name, script, timeoutMs, code) => {
      const { executable } = await topicFixture("", script);
      await expect(
        new GrokSearchClient({ executable, timeoutMs, timezoneOffset: "+08:00" }).search(
          topicInput,
        ),
      ).rejects.toMatchObject({
        code,
        message: expect.not.stringContaining("private token"),
        grok: { elapsedMs: expect.any(Number), nativeCallCount: 0 },
      });
    },
  );
});

it("searches and validates the exact evening window instead of the whole calendar day", async () => {
  const times = [
    "2026-10-08T04:29:59Z",
    "2026-10-08T04:30:00Z",
    "2026-10-08T10:59:59Z",
    "2026-10-08T11:00:00Z",
  ];
  const posts = times.map((time) => ({
    ...topicPost,
    publishedAt: time,
    url: `https://x.com/OpenAI/status/${(BigInt(Date.parse(time)) - 1288834974657n) << 22n}`,
  }));
  const { executable, capture } = await topicFixture(topicStream(posts));
  const window = { since: "2026-10-08T04:30:00.000Z", until: "2026-10-08T11:00:00.000Z" };
  const page = await new GrokSearchClient({ executable, timezoneOffset: "+08:00" }).search({
    ...topicInput,
    window,
  });
  expect(page.results.map(({ publishTime }) => publishTime)).toEqual([
    "2026-10-08T04:30:00.000Z",
    "2026-10-08T10:59:59.000Z",
  ]);
  const { args } = JSON.parse(await readFile(capture, "utf8"));
  expect(args[1]).toContain(`${window.since} inclusive and ${window.until} exclusive`);
  expect(args[1]).toContain("Make exactly one x_keyword_search call");
});

it.each([
  ["wrong date", { ...topicPost, publishedAt: "2026-10-07T01:00:00Z" }],
  ["no timezone", { ...topicPost, publishedAt: "2026-10-08T01:00:00" }],
  ["invalid date", { ...topicPost, publishedAt: "not a date" }],
  ["author mismatch", { ...topicPost, author: "other" }],
  ["off-site URL", { ...topicPost, url: `https://evil.example/OpenAI/status/${topicPostId}` }],
])("drops a lone post with %s", async (_name, candidate) => {
  const page = await search(topicStream([candidate]));
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
    ...topicPost,
    publishedAt: time,
    url: `https://x.com/OpenAI/status/${(BigInt(Date.parse(time)) - 1288834974657n) << 22n}`,
  }));
  const page = await search(topicStream(posts));
  expect(page.results.map((result) => result.publishTime)).toEqual([
    "2026-10-07T16:00:00.000Z",
    "2026-10-08T15:59:59.000Z",
  ]);
  expect(page.grok?.rejectedResults).toBe(2);
});

describeSearchProvider({
  name: "grok",
  emitsRateLimit: false,
  async create(next) {
    const publishedAt = "2026-08-16T04:00:00.000Z";
    const postId = ((BigInt(Date.parse(publishedAt)) - 1288834974657n) << 22n).toString();
    const stdout = [
      { type: "tool_call", toolCallId: "native", rawInput: { variant: "XSearch", backend: true } },
      {
        type: "tool_call_update",
        toolCallId: "native",
        status: "completed",
        rawOutput: { name: "x_keyword_search" },
      },
      {
        type: "text",
        data: JSON.stringify({
          posts: [
            {
              url: `https://x.com/OpenAI/status/${postId}`,
              author: "OpenAI",
              title: "发布",
              summary: "模型发布。",
              publishedAt,
            },
          ],
        }),
      },
      { type: "end", stopReason: "end_turn" },
    ]
      .map((event) => JSON.stringify(event))
      .join("\n");
    const directory = await mkdtemp(join(tmpdir(), "grok-suite-"));
    directories.push(directory);
    const executable = join(directory, "grok");
    await writeFile(
      executable,
      `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(stdout)});`,
      { mode: 0o700 },
    );
    let invocations = 0;
    return {
      invocations: () => invocations,
      search: (value) => {
        invocations += 1;
        const step = next();
        if (step === "http_429")
          return Effect.fail(new Error("grok transport cannot emit http_429"));
        return Effect.gen(function* () {
          const provider = yield* SearchProvider;
          return yield* provider.search(value);
        }).pipe(
          Effect.provide(
            GrokSearchLive({
              executable: step === "permanent" ? "/no/such/grok-suite" : executable,
              timezoneOffset: "+08:00",
              timeoutMs: 5_000,
            }),
          ),
        );
      },
    };
  },
});

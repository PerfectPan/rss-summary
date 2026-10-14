import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { GrokXClient } from "../../src/infrastructure/grok-x.js";

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

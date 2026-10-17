import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  RivusAgentProfile,
  RivusAutomationTemplate,
  RivusToolDescriptor,
  RivusToolExecutionContext,
} from "@rivus/agent";
import { afterEach, beforeEach, expect, vi } from "vite-plus/test";

import { runCliCommand } from "../../src/presentation/cli.js";
import { createRssSummaryPlugin } from "../../src/presentation/rivus-plugin.js";
import { FROZEN_NOW, INDUSTRY_SOURCES, NEWS_TOPICS, PERSONAL_FEEDS } from "./fixtures.js";
import { resetUuid } from "./uuid-sequence.js";

const snapshotDir = fileURLToPath(new URL("./__snapshots__/", import.meta.url));

const managedEnv = [
  "DAILY_AI_X_HANDLES",
  "DOUBAO_SEARCH_API_KEY",
  "DOUBAO_SEARCH_BASE_URL",
  "DRY_RUN",
  "FEED_DAY",
  "FEED_INTERESTS",
  "FEED_ONLY_NEW",
  "FEED_OUTPUT_FORMAT",
  "FEED_RSS_ONLY",
  "FEED_RUN_LOG_DIR",
  "FEED_STATE_FILE",
  "FEED_TIMEZONE_OFFSET",
  "GH_FEED_TOKEN",
  "GH_USERNAME",
  "GITHUB_FEED_SOURCE",
  "GITHUB_HOME_FETCH",
  "GITHUB_TOKEN",
  "GITHUB_USERNAME",
  "GLM_CODING_API_KEY",
  "GROK_COUNTER_FILE",
  "INDUSTRY_FEEDS",
  "INDUSTRY_FEEDS_FILE",
  "INDUSTRY_SOURCES",
  "INDUSTRY_SOURCES_FILE",
  "INDUSTRY_STATE_FILE",
  "NEWS_GROK_EXECUTABLE",
  "NEWS_GROK_MAX_QUERIES",
  "NEWS_GROK_MODEL",
  "NEWS_GROK_TIMEOUT_MS",
  "NEWS_SEARCH_CACHE_TTL_MINUTES",
  "NEWS_SEARCH_COUNT_PER_QUERY",
  "NEWS_SEARCH_DAILY_LIMIT",
  "NEWS_SEARCH_MAX_QUERIES",
  "NEWS_SEARCH_MODE",
  "NEWS_SEARCH_MONTHLY_LIMIT",
  "NEWS_SEARCH_STATE_FILE",
  "NEWS_TOPICS_FILE",
  "NOTIFY_WEBHOOK_URL",
  "RIVUS_DEPLOYMENT_STATE_DIR",
  "RSS_ARTICLE_BROWSER_CHANNEL",
  "RSS_ARTICLE_BROWSER_HEADLESS",
  "RSS_ARTICLE_GLM_FALLBACK",
  "RSS_FEEDS",
  "RSS_FEEDS_FILE",
  "X_ACCOUNT_POSTS_PER_FETCH",
] as const;

export type GoldenContext = {
  consoleError: string[];
  processStdout: string[];
  restore: Array<() => void>;
  root: string;
};

export type CommandCapture = {
  consoleError: string;
  exitCode: number;
  processStdout: string;
  state: Record<string, string>;
  stderr: string;
  stdout: string;
};

let current: GoldenContext | undefined;

export function useGoldenHarness(): {
  context: () => GoldenContext;
} {
  beforeEach(async () => {
    current = await createContext();
  });
  afterEach(async () => {
    const context = current;
    current = undefined;
    if (context) await destroyContext(context);
  });
  return {
    context: () => {
      if (!current) throw new Error("Golden harness is not active.");
      return current;
    },
  };
}

export async function createContext(): Promise<GoldenContext> {
  resetUuid();
  const root = await mkdtemp(join(tmpdir(), "rss-summary-golden-"));
  const previousArgv = [...process.argv];
  const previousEnv = new Map<string, string | undefined>();
  for (const key of managedEnv) previousEnv.set(key, process.env[key]);

  const context: GoldenContext = {
    consoleError: [],
    processStdout: [],
    restore: [],
    root,
  };
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    context.processStdout.push(String(chunk));
    return true;
  });
  const errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    context.consoleError.push(args.map(String).join(" "));
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(FROZEN_NOW));
  context.restore.push(
    () => stdoutSpy.mockRestore(),
    () => errorSpy.mockRestore(),
    () => vi.useRealTimers(),
    () => {
      process.argv = previousArgv;
    },
    () => {
      for (const [key, value] of previousEnv) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
    () => vi.unstubAllGlobals(),
  );

  for (const key of managedEnv) delete process.env[key];
  process.env.GITHUB_FEED_SOURCE = "events";
  process.env.GITHUB_USERNAME = "PerfectPan";
  process.env.FEED_TIMEZONE_OFFSET = "+08:00";
  process.env.FEED_INTERESTS = "typescript";
  process.env.FEED_STATE_FILE = join(root, "feed-state.json");
  process.env.INDUSTRY_STATE_FILE = join(root, "industry-state.json");
  process.env.FEED_RUN_LOG_DIR = join(root, "runs");
  process.env.NEWS_SEARCH_STATE_FILE = join(root, "news-search.json");
  process.env.RIVUS_DEPLOYMENT_STATE_DIR = join(root, "rivus");
  process.env.RSS_FEEDS_FILE = join(root, "feeds.json");
  process.env.INDUSTRY_SOURCES_FILE = join(root, "industry-sources.json");
  process.env.NEWS_TOPICS_FILE = join(root, "news-topics.json");
  process.env.RSS_FEEDS = JSON.stringify(PERSONAL_FEEDS);
  writeFileSync(
    process.env.INDUSTRY_SOURCES_FILE,
    `${JSON.stringify(INDUSTRY_SOURCES, null, 2)}\n`,
  );
  writeFileSync(process.env.NEWS_TOPICS_FILE, `${JSON.stringify(NEWS_TOPICS, null, 2)}\n`);
  writeFileSync(join(root, "feeds.json"), "[]\n");
  return context;
}

export async function destroyContext(context: GoldenContext): Promise<void> {
  for (const restore of context.restore.reverse()) restore();
  await rm(context.root, { force: true, recursive: true });
}

export function installFetch(
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>,
): void {
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      return respond(url, init);
    },
  );
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function textResponse(body: string, status = 200, contentType = "text/xml"): Response {
  return new Response(body, {
    status,
    headers: { "content-type": contentType },
  });
}

export async function writeGrokExecutable(path: string, stdout: string): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  const counter = `${path}.count`;
  const script = `#!${process.execPath}\nconst fs = require("node:fs");\nfs.appendFileSync(${JSON.stringify(counter)}, "1\\n");\nprocess.stdout.write(${JSON.stringify(stdout)});\n`;
  await writeFile(path, script, { mode: 0o755 });
  process.env.NEWS_GROK_EXECUTABLE = path;
}

export function grokInvocationCount(executable: string): number {
  const counter = `${executable}.count`;
  if (!existsSync(counter)) return 0;
  return readFileSync(counter, "utf8").split("\n").filter(Boolean).length;
}

export async function runCommand(
  argv: string[],
  context = currentContext(),
): Promise<CommandCapture> {
  context.processStdout.length = 0;
  context.consoleError.length = 0;
  process.argv = ["node", "rss-summary", ...argv];
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runCliCommand(argv, {
    stdout: {
      write: (chunk) => {
        stdout.push(String(chunk));
      },
    },
    stderr: {
      write: (chunk) => {
        stderr.push(String(chunk));
      },
    },
  });
  return {
    exitCode,
    stdout: stdout.join(""),
    stderr: stderr.join(""),
    processStdout: context.processStdout.join(""),
    consoleError: context.consoleError.join("\n"),
    state: readTree(context.root),
  };
}

export function readTree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile() || entry.name.endsWith(".lock") || entry.name.includes(".tmp")) continue;
      if (entry.name.endsWith(".count")) continue;
      out[relative(root, full).split(sep).join("/")] = readFileSync(full, "utf8");
    }
  };
  walk(root);
  return out;
}

export function redact(value: string, roots: string[]): string {
  let next = value.split(process.execPath).join("<node>");
  for (const root of [...roots].sort((left, right) => right.length - left.length)) {
    next = next.split(root).join("<tmp>");
  }
  return next;
}

export function redactValue(value: unknown, roots: string[]): unknown {
  if (typeof value === "string") return redact(value, roots);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, roots));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, redactValue(item, roots)]),
  );
}

export async function matchSnapshot(
  name: string,
  value: unknown,
  roots: string[] = [],
): Promise<void> {
  const redacted = redactValue(value, roots);
  const text = typeof redacted === "string" ? redacted : `${JSON.stringify(redacted, null, 2)}\n`;
  await expect(text).toMatchFileSnapshot(join(snapshotDir, name));
}

export function errorRecord(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { message: String(error) };
  const extra = error as Error & { code?: unknown; issues?: unknown; result?: unknown };
  return {
    name: extra.name,
    message: extra.message,
    ...(extra.code === undefined ? {} : { code: extra.code }),
    ...(extra.issues === undefined ? {} : { issues: extra.issues }),
    ...(extra.result === undefined ? {} : { result: extra.result }),
  };
}

export type PluginRegistration = {
  automations: RivusAutomationTemplate[];
  profile: RivusAgentProfile;
  tools: Map<string, RivusToolDescriptor>;
};

export function registerPlugin(): PluginRegistration {
  const tools = new Map<string, RivusToolDescriptor>();
  const automations: RivusAutomationTemplate[] = [];
  const profiles: RivusAgentProfile[] = [];
  createRssSummaryPlugin().register({
    registerAgentProfile: (profile) => {
      profiles.push(profile);
    },
    registerAutomation: (automation) => {
      automations.push(automation);
    },
    registerSkill: () => undefined,
    registerTool: (tool) => {
      tools.set(tool.id, tool);
    },
  });
  const profile = profiles[0];
  if (!profile) throw new Error("Plugin did not register a profile.");
  return { automations, profile, tools };
}

export async function executeTool(
  tools: Map<string, RivusToolDescriptor>,
  id: string,
  input: unknown,
): Promise<unknown> {
  const tool = tools.get(id);
  if (!tool) throw new Error(`Missing tool ${id}`);
  const toolContext: RivusToolExecutionContext = {
    agentId: "rss-digest",
    callId: "call-1",
    instanceId: "rss-digest:cli",
    policyEpoch: 1,
    runId: "run-1",
    sessionKey: "local:rss-digest:test",
    toolId: id,
    toolVersion: tool.version,
  };
  return tool.createExecutor(toolContext).execute(input, toolContext);
}

export function currentContext(): GoldenContext {
  if (!current) throw new Error("Golden harness is not active.");
  return current;
}

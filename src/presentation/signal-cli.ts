import { Effect } from "effect";

import { generateSignalBrief, type SignalBriefOutput } from "../application/signal-brief.js";
import { withSignalMarkdown } from "./signal-render.js";

type Writable = {
  write(chunk: string): unknown;
};

type SignalCommandDeps = {
  env?: NodeJS.ProcessEnv;
  stdout?: Writable;
  stderr?: Writable;
  generate?: (input: unknown, deps?: { env?: NodeJS.ProcessEnv }) => Promise<SignalBriefOutput>;
};

export async function runSignalCommand(argv: string[], deps: SignalCommandDeps = {}): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const env = deps.env ?? process.env;
  let args: { day?: string; occurrence?: string };
  try {
    args = parseArgs(argv);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  const generate =
    deps.generate ??
    (async (input, options) => {
      const result = await Effect.runPromise(generateSignalBrief(input, options));
      return withSignalMarkdown(result);
    });

  if (argv.includes("--help") || argv.includes("-h")) {
    writeSignalHelp(stdout);
    return 0;
  }

  try {
    const input: { day?: string; occurrence?: string } = {};
    if (args.day) input.day = args.day;
    if (args.occurrence) input.occurrence = args.occurrence;
    if (!input.day && !input.occurrence) input.occurrence = new Date().toISOString();

    const result = await generate(input, { env });
    stdout.write(result.markdown);
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export function writeSignalHelp(stdout: Writable): void {
  stdout.write(`Usage:
  rss-summary signal [--day YYYY-MM-DD] [--occurrence <iso-date-time>] [--dry-run]
`);
}

function parseArgs(argv: string[]): { day?: string; occurrence?: string } {
  const result: { day?: string; occurrence?: string } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg !== "--day" && arg !== "--occurrence") continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${arg} requires a value.`);
    }
    if (arg === "--day") result.day = value;
    if (arg === "--occurrence") result.occurrence = value;
    index += 1;
  }
  return result;
}

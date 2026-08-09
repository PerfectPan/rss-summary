import { readFileSync } from "node:fs";

import { errorMessage } from "../infrastructure/parsing.js";
import { loadFeedState, markResearchedByKey, saveFeedState } from "../infrastructure/state.js";

type Writable = {
  write(chunk: string): unknown;
};

type ResearchCommandDeps = {
  stdout?: Writable;
  stderr?: Writable;
  stdin?: AsyncIterable<Uint8Array | string>;
};

type ParsedArgs = {
  command: string;
  stateFile: string;
  file?: string;
};

type ResearchSuggestion = {
  key: string;
  decision?: string;
  reason?: string;
};

export async function runResearchCommand(
  argv: string[] = process.argv.slice(2),
  deps: ResearchCommandDeps = {},
): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  try {
    const args = parseArgs(argv);
    if (args.command === "add") {
      const text = args.file ? readFileSync(args.file, "utf8") : await readStdin(deps.stdin);
      const suggestions = parseResearchSuggestions(text);
      if (suggestions.length === 0) {
        stderr.write("No research suggestions found in input.\n");
        return 1;
      }
      const state = loadFeedState(args.stateFile);
      const at = new Date().toISOString();
      for (const suggestion of suggestions) {
        markResearchedByKey(state, suggestion.key, {
          at,
          decision: suggestion.decision,
          reason: suggestion.reason,
        });
      }
      saveFeedState(args.stateFile, state);
      stdout.write(
        `Marked ${suggestions.length} research ${suggestions.length === 1 ? "decision" : "decisions"} in ${args.stateFile}\n`,
      );
      return 0;
    }

    writeHelp(stdout);
    return args.command === "help" ? 0 : 1;
  } catch (error) {
    stderr.write(`${errorMessage(error)}\n`);
    return 1;
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] ?? "help";
  const options: Record<string, string> = {};

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${arg} requires a value.`);
    }
    options[camelCase(arg.slice(2))] = value;
    index += 1;
  }

  return {
    command,
    stateFile: options.stateFile ?? ".state/feed-state.json",
    file: options.file,
  };
}

/**
 * Parse the `调研状态更新建议:` block emitted by the feed-research prompt.
 * Each accepted line looks like: `- github:owner/repo - decision=track reason="why"` .
 */
export function parseResearchSuggestions(text: string): ResearchSuggestion[] {
  const lineRegex = /^\s*-\s+(github:\S+|rss:\S+)\s+-\s+decision=(\S+)(?:\s+reason="(.*)")?\s*$/u;
  const suggestions: ResearchSuggestion[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(lineRegex);
    if (!match) continue;
    suggestions.push({ key: match[1]!, decision: match[2], reason: match[3] });
  }
  return suggestions;
}

async function readStdin(stdin: AsyncIterable<Uint8Array | string> | undefined): Promise<string> {
  const stream = (stdin ?? process.stdin) as AsyncIterable<Uint8Array | string>;
  let text = "";
  for await (const chunk of stream) {
    text += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
  }
  return text;
}

function writeHelp(stdout: Writable): void {
  stdout.write(`Usage:
  rss-summary research add [--file <path>] [--state-file .state/feed-state.json]
  rss-summary research add < suggestions.txt
  rss-summary research help
`);
}

function camelCase(value: string): string {
  return value.replace(/-([a-z])/gu, (_, char: string) => char.toUpperCase());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runResearchCommand();
}

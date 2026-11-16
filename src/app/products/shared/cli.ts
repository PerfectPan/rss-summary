import { Effect } from "effect";

import { errorMessage } from "../../../kernel/index.js";
import { parseCliArgs } from "../../config/argv.js";
import { applyCliArgs, loadEnvConfig, type AppConfig } from "../../config/env.js";
import { appLayerFromConfig, type AppServices } from "../../layers.js";
import { runCliEffect } from "../../runtime.js";

export type Writable = {
  write(chunk: string): unknown;
};

/** The product CLI skeleton: load the env config, apply the parsed argv, and run the product's flow with it. */
export async function runProductCommand(
  argv: string[],
  deps: { stderr?: Writable } = {},
  flow: (config: AppConfig) => Effect.Effect<void, Error, AppServices>
): Promise<number> {
  const stderr = deps.stderr ?? process.stderr;
  const config = Effect.map(loadEnvConfig(), (base) => applyCliArgs(base, parseCliArgs(argv)));
  return runCliEffect(Effect.flatMap(config, flow), { stderr, layer: appLayerFromConfig(config) });
}

function camelCase(value: string): string {
  return value.replace(/-([a-z])/gu, (_, char: string) => char.toUpperCase());
}

/** The simple product-command grammar: `command --option value …`; an option without a value is an error. */
export function parseCommandOptions(argv: string[]): { command: string; options: Record<string, string> } {
  const command = argv[0] ?? "help";
  const options: Record<string, string> = {};

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined || !arg.startsWith("--")) {
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${arg} requires a value.`);
    }
    options[camelCase(arg.slice(2))] = value;
    index += 1;
  }

  return { command, options };
}

/** The error tail the product commands share: run the body, report a failure on stderr, exit 1. */
export async function runCliCommand(
  deps: { stdout?: Writable; stderr?: Writable },
  run: (stdout: Writable, stderr: Writable) => Promise<number>
): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  try {
    return await run(stdout, stderr);
  } catch (error) {
    stderr.write(`${errorMessage(error)}\n`);
    return 1;
  }
}

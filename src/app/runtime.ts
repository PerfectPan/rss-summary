import { Cause, Effect, Exit, Layer, ManagedRuntime } from "effect";

import { errorMessage } from "../kernel/text.js";

type Stderr = {
  write(chunk: string): unknown;
};

/** Plugin-scoped runtime. It has no services until later layers are assembled. */
export const pluginRuntime = ManagedRuntime.make(Layer.empty);

export function runPluginEffect<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  return pluginRuntime.runPromise(effect);
}

export async function runCliEffect<A, E>(
  effect: Effect.Effect<A, E>,
  options: { stderr: Stderr },
): Promise<number> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return 0;
  options.stderr.write(`${errorMessage(Cause.squash(exit.cause))}\n`);
  return 1;
}

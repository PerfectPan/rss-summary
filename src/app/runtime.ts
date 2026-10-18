import { Cause, Effect, Exit, Layer, ManagedRuntime } from "effect";

import { errorMessage } from "../kernel/index.js";
import { AppLiveFromEnv, type AppServices } from "./layers.js";

type Stderr = {
  write(chunk: string): unknown;
};

/**
 * A plugin-scoped runtime over AppLive. One runtime per execution keeps
 * environment-derived layer options fresh; create one per plugin instance when
 * several executions share a session.
 */
export function createPluginRuntime(): ManagedRuntime.ManagedRuntime<AppServices, Error> {
  return ManagedRuntime.make(AppLiveFromEnv);
}

/** Run one plugin effect with a runtime assembled from the current environment. */
export async function runPluginEffect<A, E>(
  effect: Effect.Effect<A, E, AppServices>,
  options: { layer?: Layer.Layer<AppServices> } = {},
): Promise<A> {
  const runtime = ManagedRuntime.make(options.layer ?? AppLiveFromEnv);
  try {
    return await runtime.runPromise(effect);
  } finally {
    await runtime.dispose();
  }
}

export async function runCliEffect<A>(
  effect: Effect.Effect<A, Error, AppServices>,
  options: { stderr: Stderr; layer?: Layer.Layer<AppServices, Error> },
): Promise<number> {
  const program = options.layer
    ? Effect.provide(effect, options.layer)
    : (effect as Effect.Effect<A, Error>);
  const exit = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(exit)) return 0;
  options.stderr.write(`${errorMessage(Cause.squash(exit.cause))}\n`);
  return 1;
}

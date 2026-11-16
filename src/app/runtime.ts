import { Cause, Effect, Exit, Layer, ManagedRuntime } from "effect";

import { errorMessage } from "../kernel/index.js";
import { AppLiveFromEnv, type AppServices } from "./layers.js";

type Stderr = {
  write(chunk: string): unknown;
};

/** Run one plugin effect with a runtime assembled from the current environment. */
export async function runPluginEffect<A, E, R = AppServices>(
  effect: Effect.Effect<A, E, R>,
  options: { layer?: Layer.Layer<R> } = {}
): Promise<A> {
  const runtime = ManagedRuntime.make(options.layer ?? (AppLiveFromEnv as Layer.Layer<R>));
  try {
    return await runtime.runPromise(effect);
  } finally {
    await runtime.dispose();
  }
}

export async function runCliEffect<A>(
  effect: Effect.Effect<A, Error, AppServices>,
  options: { stderr: Stderr; layer?: Layer.Layer<AppServices, Error> }
): Promise<number> {
  const program = options.layer ? Effect.provide(effect, options.layer) : (effect as Effect.Effect<A, Error>);
  const exit = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(exit)) {
    return 0;
  }
  options.stderr.write(`${errorMessage(Cause.squash(exit.cause))}\n`);
  return 1;
}

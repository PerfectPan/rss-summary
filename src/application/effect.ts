import { Effect } from "effect";

export const attempt = <A>(promise: Promise<A>): Effect.Effect<A, Error> =>
  Effect.tryPromise({
    try: () => promise,
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

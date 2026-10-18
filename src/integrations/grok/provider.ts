import { Effect, Layer } from "effect";

import { GrokProcess, type GrokProcessRequest, SearchProvider } from "../../acquisition/index.js";

import { GrokOptions, GrokSearchClient, GrokSearchOptions, GrokXClient } from "./cli.js";

export const GrokProcessLive = (options: GrokOptions = {}): Layer.Layer<GrokProcess> =>
  Layer.succeed(GrokProcess, {
    run: (request: GrokProcessRequest) =>
      Effect.tryPromise({
        try: () =>
          new GrokXClient({
            executable: request.executable ?? options.executable,
            model: request.model ?? options.model,
            timeoutMs: request.timeoutMs ?? options.timeoutMs,
          }).search(request),
        catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
      }),
  });

export const GrokSearchLive = (options: GrokSearchOptions): Layer.Layer<SearchProvider> => {
  const client = new GrokSearchClient(options);
  return Layer.succeed(SearchProvider, {
    search: (input) =>
      Effect.tryPromise({
        try: () => client.search(input),
        catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
      }),
  });
};

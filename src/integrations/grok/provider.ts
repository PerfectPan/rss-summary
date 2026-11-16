import { Effect, Layer } from "effect";

import { SearchProvider } from "../../acquisition/index.js";

import { GrokSearchClient, type GrokSearchOptions } from "./cli.js";

export const GrokSearchLive = (options: GrokSearchOptions): Layer.Layer<SearchProvider> => {
  const client = new GrokSearchClient(options);
  return Layer.succeed(SearchProvider, {
    search: (input) =>
      Effect.tryPromise({
        try: () => client.search(input),
        catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause)))
      })
  });
};

import { Effect, Layer } from "effect";

import { SearchProvider } from "../../acquisition/index.js";

import { DeepSeekSearchClient } from "./client.js";

export type DeepSeekSearchClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export const DeepSeekSearchLive = (
  options: DeepSeekSearchClientOptions,
): Layer.Layer<SearchProvider> => {
  const client = new DeepSeekSearchClient(options);
  return Layer.succeed(SearchProvider, {
    search: (input) =>
      Effect.tryPromise({
        try: () => client.search(input),
        catch: (cause) => (cause instanceof Error ? cause : new Error(errorText(cause))),
      }),
  });
};

function errorText(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

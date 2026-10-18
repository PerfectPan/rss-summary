import { Effect, Layer } from "effect";

import { SearchProvider } from "../../acquisition/index.js";

import { DoubaoSearchClient } from "./client.js";

export type DoubaoSearchClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export const DoubaoSearchLive = (
  options: DoubaoSearchClientOptions,
): Layer.Layer<SearchProvider> => {
  const client = new DoubaoSearchClient(options);
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

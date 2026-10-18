import { Effect, Layer } from "effect";
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http";

/** Keep AbortSignal.timeout so transient failures stay TimeoutError for the existing retry predicate. */
export function timeoutFetch(fetchImpl: typeof fetch, timeoutMs: number): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetchImpl(input, { ...init, signal });
  };
}

export function provideHttp<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  fetchImpl: typeof fetch,
): Effect.Effect<A, E, Exclude<R, HttpClient.HttpClient>> {
  return effect.pipe(
    Effect.provide(Layer.succeed(HttpClient.HttpClient, makeFetchClient(fetchImpl))) as never,
  ) as Effect.Effect<A, E, Exclude<R, HttpClient.HttpClient>>;
}

function makeFetchClient(fetchImpl: typeof fetch): HttpClient.HttpClient {
  return HttpClient.make((request, url, signal) =>
    Effect.tryPromise({
      try: () =>
        fetchImpl(url, {
          method: request.method,
          headers: request.headers,
          signal,
        }),
      catch: (cause) =>
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({ request, cause }),
        }),
    }).pipe(Effect.map((response) => HttpClientResponse.fromWeb(request, response))),
  );
}

export function asError(error: unknown): Error {
  const cause = unwrapTransport(error);
  return cause instanceof Error ? cause : new Error(String(cause));
}

function unwrapTransport(error: unknown): unknown {
  if (HttpClientError.isHttpClientError(error) && error.reason._tag === "TransportError") {
    return error.reason.cause ?? error;
  }
  return error;
}

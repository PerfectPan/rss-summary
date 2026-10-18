/**
 * One tagged failure for every historical search `code`. Provider codes are an
 * open set, so the discriminant is a single tag and `code` stays a string.
 * The value is an `Error` because audit text reads `message` and rejected
 * promises expose `code`. Provider-specific fields travel in `options` and are
 * copied onto the instance so this concept file does not name a source.
 */
export type SearchFailure = {
  readonly _tag: "SearchFailure";
  readonly code: string;
  readonly message: string;
  readonly retryAfterMs?: number;
};

export class NewsSearchError extends Error implements SearchFailure {
  readonly _tag = "SearchFailure" as const;
  readonly code: string;
  readonly retryAfterMs?: number;

  constructor(
    code: string,
    message: string,
    options: { readonly retryAfterMs?: number; readonly [key: string]: unknown } = {},
  ) {
    super(message);
    this.name = "NewsSearchError";
    this.code = code;
    this.retryAfterMs = options.retryAfterMs;
    const extras = options as { readonly retryAfterMs?: number; readonly [key: string]: unknown };
    for (const key of Object.keys(extras)) {
      if (key === "retryAfterMs") continue;
      Object.defineProperty(this, key, {
        value: extras[key],
        enumerable: true,
        writable: true,
      });
    }
  }
}

export function isSearchFailure(value: unknown): value is NewsSearchError {
  if (typeof value !== "object" || value === null) return false;
  const failure = value as { _tag?: unknown; code?: unknown };
  return failure._tag === "SearchFailure" && typeof failure.code === "string";
}

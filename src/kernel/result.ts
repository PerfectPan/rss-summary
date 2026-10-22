export type Result<A, E> =
  | { readonly _tag: "Ok"; readonly value: A }
  | { readonly _tag: "Err"; readonly error: E };

export function ok<A>(value: A): Result<A, never> {
  return { _tag: "Ok", value };
}

export function err<E>(error: E): Result<never, E> {
  return { _tag: "Err", error };
}

export function isOk<A, E>(
  result: Result<A, E>,
): result is { readonly _tag: "Ok"; readonly value: A } {
  return result._tag === "Ok";
}

export function isErr<A, E>(
  result: Result<A, E>,
): result is { readonly _tag: "Err"; readonly error: E } {
  return result._tag === "Err";
}

import isPlainObject from "lodash-es/isPlainObject.js";

/** Soft cast: plain object → record, anything else → `{}`. Built on lodash-es. */
export function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? (value as Record<string, unknown>) : {};
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}

import isFinite from "lodash-es/isFinite.js";
import isNumber from "lodash-es/isNumber.js";
import isPlainObject from "lodash-es/isPlainObject.js";
import isString from "lodash-es/isString.js";
import toString from "lodash-es/toString.js";
import trim from "lodash-es/trim.js";

export function boundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Numeric configuration must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

export function hostnameOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./u, "");
  } catch {
    return value;
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? (value as Record<string, unknown>) : {};
}

export function text(value: unknown): string | undefined {
  if (isString(value)) {
    const normalized = trim(value);
    return normalized === "" ? undefined : normalized;
  }
  if (isNumber(value) && isFinite(value)) return toString(value);
  return undefined;
}

export function number(value: unknown): number | undefined {
  return isNumber(value) && isFinite(value) ? value : undefined;
}

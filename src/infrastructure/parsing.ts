import isFinite from "lodash-es/isFinite.js";
import isNumber from "lodash-es/isNumber.js";
import isString from "lodash-es/isString.js";
import toString from "lodash-es/toString.js";
import trim from "lodash-es/trim.js";

import { asRecord, isRecord } from "../domain/record.js";

export { asRecord, isRecord };

export function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value;
}

export function asRecordOrNull(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

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

/** CLI / logging: normalize thrown values to a single-line message. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

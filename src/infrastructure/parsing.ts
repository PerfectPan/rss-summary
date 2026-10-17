import { asRecord, isRecord } from "../domain/record.js";

export { errorMessage } from "../kernel/text.js";
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
  if (isStringValue(value)) {
    const normalized = value.trim();
    return normalized === "" ? undefined : normalized;
  }
  if (isFiniteNumber(value)) return finiteNumberText(value);
  return undefined;
}

export function number(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}

function isStringValue(value: unknown): value is string {
  // Primitive strings and boxed String objects; arrays are not strings.
  return (
    typeof value === "string" ||
    (isObjectLike(value) &&
      !Array.isArray(value) &&
      Object.prototype.toString.call(value) === "[object String]")
  );
}

function isFiniteNumber(value: unknown): value is number {
  // Finite primitive numbers only, so a boxed Number fails.
  return typeof value === "number" && Number.isFinite(value);
}

function finiteNumberText(value: number): string {
  // Keep the sign of -0; String(-0) is "0".
  return Object.is(value, -0) ? "-0" : String(value);
}

function isObjectLike(value: unknown): value is object {
  return value !== null && typeof value === "object";
}


import isBoolean from "lodash-es/isBoolean.js";
import isFinite from "lodash-es/isFinite.js";
import isInteger from "lodash-es/isInteger.js";
import isNumber from "lodash-es/isNumber.js";
import isString from "lodash-es/isString.js";
import trim from "lodash-es/trim.js";

/** Shared JSON config validators (signal-sources, news-topics, …). */

export function requiredString(value: unknown, label: string): string {
  if (!isString(value) || trim(value) === "")
    throw new Error(`${label} must be a non-empty string.`);
  return trim(value);
}

export function optionalString(value: unknown, fallback: string, label: string): string {
  if (value === undefined) return fallback;
  return requiredString(value, label);
}

export function optionalBoolean(value: unknown, fallback: boolean, label: string): boolean {
  if (value === undefined) return fallback;
  if (!isBoolean(value)) throw new Error(`${label} must be a boolean.`);
  return value;
}

export function requireBoundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  label: string,
): number {
  if (value === undefined) return fallback;
  if (!isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  }
  return Number(value);
}

export function requireBoundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  label: string,
): number {
  if (value === undefined) return fallback;
  if (!isNumber(value) || !isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be a number between ${min} and ${max}.`);
  }
  return value;
}

export function requirePositiveInteger(value: unknown, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!isInteger(value) || Number(value) <= 0)
    throw new Error(`${label} must be a positive integer.`);
  return Number(value);
}

export function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

export function requireStringList(value: unknown, label: string): string[] {
  return requireArray(value, label).map((item, index) => {
    if (!isString(item) || trim(item) === "") {
      throw new Error(`${label}[${index}] must be a non-empty string.`);
    }
    return trim(item);
  });
}

/** Shared JSON config validators for tracked source and topic policies. */

export function requiredString(value: unknown, label: string): string {
  const text = stringValue(value);
  if (text === undefined || text.trim() === "")
    throw new Error(`${label} must be a non-empty string.`);
  return text.trim();
}

export function optionalString(value: unknown, fallback: string, label: string): string {
  if (value === undefined) return fallback;
  return requiredString(value, label);
}

export function optionalBoolean(value: unknown, fallback: boolean, label: string): boolean {
  if (value === undefined) return fallback;
  if (!isBooleanValue(value)) throw new Error(`${label} must be a boolean.`);
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
  // Number.isInteger matches the previous integer check and rejects boxed Number objects.
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
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
  // Only finite primitive numbers; boxed Number and non-finite values are rejected.
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be a number between ${min} and ${max}.`);
  }
  return value;
}

export function requirePositiveInteger(value: unknown, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || Number(value) <= 0)
    throw new Error(`${label} must be a positive integer.`);
  return Number(value);
}

export function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

export function requireStringList(value: unknown, label: string): string[] {
  return requireArray(value, label).map((item, index) => {
    const text = stringValue(item);
    if (text === undefined || text.trim() === "") {
      throw new Error(`${label}[${index}] must be a non-empty string.`);
    }
    return text.trim();
  });
}

function stringValue(value: unknown): string | undefined {
  // Primitive strings and boxed String objects; arrays are not strings.
  if (typeof value === "string") return value;
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object String]"
  ) {
    return String(value);
  }
  return undefined;
}

function isBooleanValue(value: unknown): value is boolean {
  // Primitive booleans and boxed Boolean objects.
  return (
    value === true ||
    value === false ||
    (value !== null &&
      typeof value === "object" &&
      Object.prototype.toString.call(value) === "[object Boolean]")
  );
}

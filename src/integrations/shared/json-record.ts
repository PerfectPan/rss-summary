const objectCtorString = Function.prototype.toString.call(Object);

/** Soft cast: plain object → record, anything else → `{}`. */
export function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

export function text(value: unknown): string | undefined {
  if (isStringValue(value)) {
    const normalized = value.trim();
    return normalized === "" ? undefined : normalized;
  }
  if (isFiniteNumber(value)) return finiteNumberText(value);
  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  // Equivalent plain-object check: `[object Object]`, then a null prototype or a prototype whose constructor is Object.
  if (value === null || typeof value !== "object") return false;
  if (Object.prototype.toString.call(value) !== "[object Object]") return false;
  const proto: object | null = Object.getPrototypeOf(value);
  if (proto === null) return true;
  const ctor = Object.prototype.hasOwnProperty.call(proto, "constructor") && proto.constructor;
  return (
    typeof ctor === "function" &&
    ctor instanceof ctor &&
    Function.prototype.toString.call(ctor) === objectCtorString
  );
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

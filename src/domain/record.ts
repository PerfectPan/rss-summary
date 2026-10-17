const objectCtorString = Function.prototype.toString.call(Object);

/** Soft cast: plain object → record, anything else → `{}`. */
export function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
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

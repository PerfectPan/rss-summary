/** The search tool returns an array of `{ title, link, content }` records. */
export function glmResultList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error("GLM search returned an invalid result list.");
  return value.map(asRecord);
}

export function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

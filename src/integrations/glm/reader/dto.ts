/** The webReader tool returns `{ title, url, content, metadata }`. */
export function readerPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function publicationTime(metadata: unknown): { publishedAt?: string } {
  const record = readerPayload(metadata);
  // Keep date-only precision. The consumer decides whether the entire day fits its window.
  const values = [record["article:published_time"], record.datePublished, record["datepublished"]]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim());
  if (values.length && values.every((value) => /^\d{4}-\d{2}-\d{2}$/u.test(value))) {
    const day = new Date(`${values[0]}T00:00:00Z`);
    if (
      new Set(values).size === 1 &&
      Number.isFinite(day.getTime()) &&
      day.toISOString().slice(0, 10) === values[0]
    )
      return { publishedAt: values[0] };
    return {};
  }
  const times = values.map((value) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value))
      return Number.NaN;
    const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    if (
      !Number.isFinite(day.getTime()) ||
      day.toISOString().slice(0, 10) !== value.slice(0, 10) ||
      Number(value.slice(11, 13)) > 23
    )
      return Number.NaN;
    return Date.parse(value);
  });
  if (!times.length || times.some((time) => !Number.isFinite(time)) || new Set(times).size !== 1)
    return {};
  return { publishedAt: new Date(times[0]!).toISOString() };
}

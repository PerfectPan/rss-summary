/** CLI / logging: normalize thrown values to a single-line message. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function canonicalizeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    url.hash = "";
    // Snapshot keys before deleting: mutating searchParams during iteration skips entries.
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/iu.test(key) || ["from", "source", "ref", "spm"].includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/u, "");
    return url.toString();
  } catch {
    return undefined;
  }
}

export function parsePublishTime(value: string, timezoneOffset?: string): number {
  const normalized = value.trim().replace(" ", "T");
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/iu.test(normalized);
  return Date.parse(
    !hasExplicitZone && timezoneOffset ? `${normalized}${timezoneOffset}` : normalized,
  );
}

export function compactSummary(value: string, title: string, siteName?: string): string {
  let normalized = value.replace(/\s+/gu, " ").trim();
  normalized = stripLeadingLiteral(normalized, title);
  normalized = stripLeadingLiteral(normalized, siteName);
  normalized = normalized.replace(
    /^20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\s*/u,
    "",
  );
  normalized = stripLeadingLiteral(normalized, title);
  normalized = normalized.replace(/^[：:·|—–\-，,。；;\s]+/u, "");

  const sentences = normalized.match(/[^。！？!?]+[。！？!?]?/gu) ?? [];
  const summary = sentences.slice(0, 2).join("").trim() || "暂无可用摘要。";
  return summary.length <= 110 ? summary : `${summary.slice(0, 109).trimEnd()}…`;
}

/** Compact human-readable counts for stars, points, etc. (domain + presentation). */
export function formatCompactCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function stripLeadingLiteral(value: string, literal: string | undefined): string {
  const prefix = literal?.replace(/\s+/gu, " ").trim();
  if (!prefix || !value.startsWith(prefix)) return value;
  return value.slice(prefix.length).replace(/^[：:·|—–\-，,。；;\s]+/u, "");
}

export function canonicalizeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    url.hash = "";
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
  return Date.parse(!hasExplicitZone && timezoneOffset ? `${normalized}${timezoneOffset}` : normalized);
}

export function compactSummary(value: string, title: string, siteName?: string): string {
  let normalized = value.replace(/\s+/gu, " ").trim();
  normalized = stripLeadingLiteral(normalized, title);
  normalized = stripLeadingLiteral(normalized, siteName);
  normalized = normalized.replace(/^20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\s*/u, "");
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

export function isSameTitleEvent(left: { title: string }, right: { title: string }): boolean {
  const leftFeatures = titleFeatures(left.title);
  const rightFeatures = titleFeatures(right.title);
  const smallerSize = Math.min(leftFeatures.size, rightFeatures.size);
  if (smallerSize < 4) return false;

  let shared = 0;
  for (const feature of leftFeatures) {
    if (rightFeatures.has(feature)) shared += 1;
  }
  return shared >= 4 && shared / smallerSize >= 0.6;
}

function stripLeadingLiteral(value: string, literal: string | undefined): string {
  const prefix = literal?.replace(/\s+/gu, " ").trim();
  if (!prefix || !value.startsWith(prefix)) return value;
  return value.slice(prefix.length).replace(/^[：:·|—–\-，,。；;\s]+/u, "");
}

const genericTitleFeatures = new Set([
  "about",
  "from",
  "important",
  "latest",
  "news",
  "the",
  "update",
  "with",
  "今日",
  "发布",
  "完成",
  "宣布",
  "新闻",
  "最新",
  "消息",
  "用户",
  "重要",
  "注意",
]);

function titleFeatures(value: string): Set<string> {
  const normalized = value.normalize("NFKC").toLowerCase();
  const features = new Set<string>();
  for (const match of normalized.matchAll(/\p{Script=Han}+/gu)) {
    const text = match[0];
    for (let index = 0; index < text.length - 1; index += 1) {
      const feature = text.slice(index, index + 2);
      if (!genericTitleFeatures.has(feature)) features.add(feature);
    }
  }
  for (const match of normalized.matchAll(/[a-z0-9]+(?:[.+-][a-z0-9]+)*/gu)) {
    const feature = match[0];
    if (feature.length >= 2 && !genericTitleFeatures.has(feature)) features.add(feature);
  }
  return features;
}

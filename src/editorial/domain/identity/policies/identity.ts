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

/** Daily AI headline equality. Distinct from title-feature overlap. */
export function isSameHeadline(left: string, right: string): boolean {
  return normalizeHeadline(left) === normalizeHeadline(right);
}

export function isSameEntityEvent(
  left: { url: string; title: string },
  right: { url: string; title: string },
): boolean {
  if (left.url === right.url) return true;
  return isSameHeadline(left.title, right.title);
}

export function normalizeHeadline(value: string): string {
  return cleanText(value).normalize("NFKC").toLowerCase();
}

function cleanText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
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

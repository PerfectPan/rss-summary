import { canonicalizeUrl, isSameTitleEvent } from "./text.js";

export const dailyAiCategories = [
  "概览/要闻",
  "模型发布",
  "开发生态",
  "产品应用",
  "行业动态",
  "技术与洞察",
] as const;

export type DailyAiCategory = (typeof dailyAiCategories)[number];
export type DailyAiSourceTier = "official" | "authoritative" | "aggregator";

export type DailyAiEvidence = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  excerpt: string;
  tier: DailyAiSourceTier;
  sourceName: string;
  topicId?: string;
};

export type DailyAiEditorialItem = {
  category: DailyAiCategory;
  headline: string;
  refs: string[];
};

export type DailyAiDecision = {
  evidenceIds: string[];
  status: "selected" | "filtered" | "merged";
  reason: string;
};

export type DailyAiDigest = {
  evidence: DailyAiEvidence[];
  items: DailyAiEditorialItem[];
  audit: { decisions: DailyAiDecision[] };
};

export function buildDailyAiDigest(
  inputEvidence: DailyAiEvidence[],
  options: { draft?: unknown } = {},
): DailyAiDigest {
  const evidence = normalizeEvidence(inputEvidence);
  const groups: DailyAiEvidence[][] = [];
  const decisions: DailyAiDecision[] = [];
  for (const item of evidence) {
    const group = groups.find((current) => isSameEntityEvent(current[0]!, item));
    if (group) {
      group.push(item);
      decisions.push({
        evidenceIds: [item.id],
        status: "merged",
        reason: `merged-with:${group[0]!.id}`,
      });
    } else {
      groups.push([item]);
    }
  }

  const fallback = groups.filter(isPublishableGroup).map(toFallbackItem).slice(0, 24);
  let items = fallback;
  if (options.draft !== undefined) {
    try {
      items = validateEditorialDraft(options.draft, evidence).slice(0, 24);
    } catch {
      decisions.push({ evidenceIds: [], status: "filtered", reason: "invalid-editorial-output" });
    }
  }
  const selected = new Set(items.flatMap(({ refs }) => refs));
  for (const group of groups) {
    if (group.some(({ id }) => selected.has(id))) {
      decisions.push({
        evidenceIds: group.map(({ id }) => id),
        status: "selected",
        reason: "event-shaped-grounded-evidence",
      });
    } else {
      decisions.push({
        evidenceIds: group.map(({ id }) => id),
        status: "filtered",
        reason: "not-an-event-or-insufficient-authority",
      });
    }
  }
  return { evidence, items, audit: { decisions } };
}

export function validateEditorialDraft(
  value: unknown,
  evidence: DailyAiEvidence[],
): DailyAiEditorialItem[] {
  if (!Array.isArray(value)) throw new Error("editorial output must be an array");
  const known = new Set(evidence.map(({ id }) => id));
  const items = value.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("editorial item must be an object");
    const record = entry as Record<string, unknown>;
    const category = record.category;
    const headline = typeof record.headline === "string" ? record.headline.trim() : "";
    const refs = Array.isArray(record.refs)
      ? record.refs.filter((ref): ref is string => typeof ref === "string")
      : [];
    if (!dailyAiCategories.includes(category as DailyAiCategory))
      throw new Error("invalid category");
    if (!isEventHeadline(headline)) throw new Error("headline 不是合格的中文事件句");
    if (headline.length > 90) throw new Error("headline is too long");
    if (refs.length === 0 || refs.some((ref) => !known.has(ref)))
      throw new Error("unknown reference");
    return { category: category as DailyAiCategory, headline, refs: [...new Set(refs)] };
  });
  const unique: DailyAiEditorialItem[] = [];
  for (const item of items) {
    if (
      !unique.some((existing) =>
        isSameTitleEvent({ title: existing.headline }, { title: item.headline }),
      )
    )
      unique.push(item);
  }
  return unique;
}

function normalizeEvidence(input: DailyAiEvidence[]): DailyAiEvidence[] {
  const ids = new Set<string>();
  return input.flatMap((item) => {
    const url = canonicalizeUrl(item.url);
    if (!item.id || ids.has(item.id) || !url || !/^https?:$/u.test(new URL(url).protocol))
      return [];
    ids.add(item.id);
    return [{ ...item, title: cleanText(item.title), excerpt: cleanText(item.excerpt), url }];
  });
}

function isPublishableGroup(group: DailyAiEvidence[]): boolean {
  if (!group.some((item) => item.tier !== "aggregator")) return false;
  return group.some((item) => isEventHeadline(item.title));
}

function toFallbackItem(group: DailyAiEvidence[]): DailyAiEditorialItem {
  const representative = group.find((item) => item.tier === "official") ?? group[0]!;
  return {
    category: categoryFor(representative),
    headline: representative.title.replace(/[。.!！]+$/u, ""),
    refs: group.map(({ id }) => id),
  };
}

function categoryFor(item: DailyAiEvidence): DailyAiCategory {
  if (item.topicId === "ai-model-releases" || /模型|model|权重|参数/iu.test(item.title))
    return "模型发布";
  if (item.topicId === "developer-tools" || /开发|API|SDK|开源|release|CLI/iu.test(item.title))
    return "开发生态";
  if (item.topicId === "capital-industry" || /融资|收购|估值|投资/iu.test(item.title))
    return "行业动态";
  if (item.topicId === "tech-policy" || /政策|监管|法案/iu.test(item.title)) return "概览/要闻";
  if (/研究|论文|benchmark|技术/iu.test(item.title)) return "技术与洞察";
  return "产品应用";
}

function isSameEntityEvent(left: DailyAiEvidence, right: DailyAiEvidence): boolean {
  if (left.url === right.url) return true;
  return isSameTitleEvent(left, right);
}

function isEventHeadline(value: string): boolean {
  const headline = cleanText(value);
  if (!/\p{Script=Han}/u.test(headline)) return false;
  if (/GitHub Home 在 GitHub Home 推荐了/u.test(headline)) return false;
  return /发布|推出|上线|开放|开源|宣布|完成|收购|融资|更新|新增|支持|降低|提升|修复|披露|生效|预告|提供/u.test(
    headline,
  );
}

function cleanText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

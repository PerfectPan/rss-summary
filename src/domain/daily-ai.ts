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

export type DailyAiResearch = {
  content?: string;
  ref: string;
  status: "failed" | "ok";
  title?: string;
  url: string;
};

export type DailyAiDigest = {
  evidence: DailyAiEvidence[];
  items: DailyAiEditorialItem[];
  audit: { decisions: DailyAiDecision[] };
};

export function buildDailyAiDigest(
  inputEvidence: DailyAiEvidence[],
  options: { draft?: unknown; research?: unknown } = {},
): DailyAiDigest {
  const evidence = mergeDailyAiResearch(normalizeEvidence(inputEvidence), options.research);
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

/** Enrich candidate excerpts with content fetched by the Agent's research Tool. */
export function mergeDailyAiResearch(
  evidence: DailyAiEvidence[],
  value: unknown,
): DailyAiEvidence[] {
  if (value === undefined) return evidence;
  if (!Array.isArray(value)) throw new Error("research output must be an array");
  const byRef = new Map(evidence.map((item) => [item.id, item]));
  const researched = new Map<string, DailyAiResearch>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") throw new Error("research item must be an object");
    const record = entry as Record<string, unknown>;
    const ref = typeof record.ref === "string" ? record.ref : "";
    const source = byRef.get(ref);
    if (!source) throw new Error(`unknown research reference: ${ref}`);
    const url = typeof record.url === "string" ? record.url : "";
    if (url !== source.url) throw new Error(`research URL does not match evidence: ${ref}`);
    const status = record.status;
    if (status !== "ok" && status !== "failed") throw new Error(`invalid research status: ${ref}`);
    const content = record.content;
    if (status === "ok" && (typeof content !== "string" || content.trim().length < 80)) {
      throw new Error(`research content is too short: ${ref}`);
    }
    researched.set(ref, {
      ...(typeof content === "string" ? { content } : {}),
      ref,
      status,
      ...(typeof record.title === "string" ? { title: record.title } : {}),
      url,
    });
  }
  return evidence.map((item) => {
    const research = researched.get(item.id);
    if (!research || research.status !== "ok" || !research.content) return item;
    return {
      ...item,
      excerpt: `${item.excerpt}\n${research.content}`.slice(0, 8_000),
      title: research.title?.trim() || item.title,
    };
  });
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
    if (hasCollectionLabelSubject(headline))
      throw new Error("headline 不得包含 Blog/Changelog/Releases 等采集源标签");
    if (headline.length > 90) throw new Error("headline is too long");
    if (refs.length === 0 || refs.some((ref) => !known.has(ref)))
      throw new Error("unknown reference");
    assertGroundedHeadline(headline, refs, evidence);
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

function assertGroundedHeadline(
  headline: string,
  refs: string[],
  evidence: DailyAiEvidence[],
): void {
  const referenced = evidence.filter(({ id }) => refs.includes(id));
  const sourceText = referenced
    .flatMap(({ title, excerpt, sourceName }) => [title, excerpt, sourceName])
    .join(" ");
  const missingNumber = numericClaims(headline).find(
    (claim) => !numericClaims(sourceText).includes(claim),
  );
  if (missingNumber) throw new Error(`headline 数字 ${missingNumber} 没有来源依据`);

  const actionIndex = headline.search(EVENT_ACTION_PATTERN);
  const subject = actionIndex > 0 ? headline.slice(0, actionIndex) : headline;
  const headlineTerms = groundingTerms(subject);
  const sourceTerms = new Set(groundingTerms(sourceText));
  if (!headlineTerms.some((term) => sourceTerms.has(term)))
    throw new Error("headline is not grounded in the referenced entity or event");
}

function numericClaims(value: string): string[] {
  return [...value.matchAll(/\d+(?:[.,]\d+)*(?:\s?(?:%|％|B|M|K|亿|万))?/giu)].map(([claim]) =>
    claim.replace(/[\s,]/gu, "").replace("％", "%").toLowerCase(),
  );
}

function groundingTerms(value: string): string[] {
  const terms = new Set<string>();
  for (const [term] of value.matchAll(/[A-Za-z][A-Za-z0-9.+-]{1,}/gu)) {
    const normalized = term.toLowerCase();
    if (!GROUNDING_STOP_TERMS.has(normalized)) terms.add(normalized);
  }
  for (const [segment] of value.matchAll(/[\p{Script=Han}]{2,}/gu)) {
    for (let index = 0; index < segment.length - 1; index += 1) {
      const term = segment.slice(index, index + 2);
      if (!GROUNDING_STOP_TERMS.has(term)) terms.add(term);
    }
  }
  return [...terms];
}

const GROUNDING_STOP_TERMS = new Set([
  "ai",
  "api",
  "model",
  "models",
  "agent",
  "agents",
  "发布",
  "推出",
  "上线",
  "开放",
  "开源",
  "宣布",
  "完成",
  "更新",
  "新增",
  "支持",
  "降低",
  "提升",
  "修复",
  "披露",
  "生效",
  "预告",
  "提供",
  "报道",
  "即将",
  "正式",
]);

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
  return EVENT_ACTION_PATTERN.test(headline);
}

const EVENT_ACTION_PATTERN =
  /发布|推出|上线|开放|开源|宣布|完成|收购|融资|更新|新增|支持|降低|提升|提高|修复|披露|生效|预告|提供|添加|保持|位列|升级|重置|敦促|暂停|合作|计划|扩大|停止|阐述|发文|启用/u;

const COLLECTION_LABEL_PATTERN = /\b(?:blog|changelog|releases)\b/iu;

function hasCollectionLabelSubject(headline: string): boolean {
  const actionIndex = headline.search(EVENT_ACTION_PATTERN);
  const subject = actionIndex > 0 ? headline.slice(0, actionIndex) : headline;
  return COLLECTION_LABEL_PATTERN.test(subject);
}

function cleanText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

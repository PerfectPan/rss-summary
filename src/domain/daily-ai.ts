import { canonicalizeUrl } from "./text.js";

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

export type DailyAiEditorialIssueReason =
  | "invalid-draft"
  | "invalid-item"
  | "invalid-category"
  | "invalid-headline"
  | "empty-draft"
  | "unknown-reference";

export type DailyAiEditorialIssue = {
  index: number;
  refs: string[];
  reason: DailyAiEditorialIssueReason;
  message: string;
};

export type DailyAiEditorialValidation = {
  items: DailyAiEditorialItem[];
  issues: DailyAiEditorialIssue[];
};

export class DailyAiDraftValidationError extends Error {
  readonly code = "DAILY_AI_DRAFT_VALIDATION_FAILED";

  constructor(readonly issues: readonly DailyAiEditorialIssue[]) {
    super("Daily AI editorial draft must contain at least one valid item");
    this.name = "DailyAiDraftValidationError";
  }
}

export type DailyAiDigest = {
  evidence: DailyAiEvidence[];
  items: DailyAiEditorialItem[];
  audit: { decisions: DailyAiDecision[]; editorialIssues: DailyAiEditorialIssue[] };
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

  let items: DailyAiEditorialItem[] = [];
  let editorialIssues: DailyAiEditorialIssue[] = [];
  if (options.draft !== undefined) {
    const validation = validateEditorialDraft(options.draft, evidence);
    items = validation.items.slice(0, 24);
    editorialIssues = validation.issues;
    if (evidence.length > 0 && items.length === 0) {
      if (editorialIssues.length === 0) {
        editorialIssues = [
          {
            index: -1,
            refs: [],
            reason: "empty-draft",
            message: "editorial draft is empty",
          },
        ];
      }
      throw new DailyAiDraftValidationError(editorialIssues);
    }
  }
  const selected = new Set(items.flatMap(({ refs }) => refs));
  for (const group of groups) {
    if (group.some(({ id }) => selected.has(id))) {
      decisions.push({
        evidenceIds: group.map(({ id }) => id),
        status: "selected",
        reason: "selected-by-editorial-draft",
      });
    } else if (options.draft !== undefined) {
      decisions.push({
        evidenceIds: group.map(({ id }) => id),
        status: "filtered",
        reason: "not-selected-by-editorial-draft",
      });
    }
  }
  return { evidence, items, audit: { decisions, editorialIssues } };
}

export function validateEditorialDraft(
  value: unknown,
  evidence: DailyAiEvidence[],
): DailyAiEditorialValidation {
  if (!Array.isArray(value))
    return {
      items: [],
      issues: [
        {
          index: -1,
          refs: [],
          reason: "invalid-draft",
          message: "editorial output must be an array",
        },
      ],
    };
  const known = new Set(evidence.map(({ id }) => id));
  const items: DailyAiEditorialItem[] = [];
  const issues: DailyAiEditorialIssue[] = [];
  for (const [index, entry] of value.entries()) {
    if (!entry || typeof entry !== "object") {
      issues.push({
        index,
        refs: [],
        reason: "invalid-item",
        message: "editorial item must be an object",
      });
      continue;
    }
    const record = entry as Record<string, unknown>;
    const category = record.category;
    const headline = typeof record.headline === "string" ? record.headline.trim() : "";
    const refs = Array.isArray(record.refs)
      ? record.refs.filter((ref): ref is string => typeof ref === "string")
      : [];
    if (!dailyAiCategories.includes(category as DailyAiCategory)) {
      issues.push({ index, refs, reason: "invalid-category", message: "invalid category" });
      continue;
    }
    if (!headline || headline.length > 90) {
      issues.push({
        index,
        refs,
        reason: "invalid-headline",
        message: !headline ? "headline is required" : "headline is too long",
      });
      continue;
    }
    if (refs.length === 0 || refs.some((ref) => !known.has(ref))) {
      issues.push({ index, refs, reason: "unknown-reference", message: "unknown reference" });
      continue;
    }
    items.push({ category: category as DailyAiCategory, headline, refs: [...new Set(refs)] });
  }
  const unique: DailyAiEditorialItem[] = [];
  for (const item of items) {
    if (!unique.some((existing) => isSameHeadline(existing.headline, item.headline)))
      unique.push(item);
  }
  return { items: unique, issues };
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

function isSameEntityEvent(left: DailyAiEvidence, right: DailyAiEvidence): boolean {
  if (left.url === right.url) return true;
  return isSameHeadline(left.title, right.title);
}

function isSameHeadline(left: string, right: string): boolean {
  return (
    cleanText(left).normalize("NFKC").toLowerCase() ===
    cleanText(right).normalize("NFKC").toLowerCase()
  );
}

function cleanText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

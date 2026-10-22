import {
  invalidEditorialCollectionMessage,
  invalidEditorialItemMessage,
} from "../../evidence/index.js";
import { isSameHeadline } from "../../identity/index.js";
import {
  dailyAiCategories,
  type DailyAiCategory,
  type DailyAiEditorialItem,
  type DailyAiEditorialIssue,
  type DailyAiEditorialValidation,
  type DailyAiEvidence,
} from "../value-objects/daily-ai.js";

export function validateEditorialDraft(
  value: unknown,
  evidence: DailyAiEvidence[],
): DailyAiEditorialValidation {
  const invalidCollection = invalidEditorialCollectionMessage(value);
  if (invalidCollection) {
    return {
      items: [],
      issues: [{ index: -1, refs: [], reason: "invalid-draft", message: invalidCollection }],
    };
  }
  const known = new Set(evidence.map(({ id }) => id));
  const items: DailyAiEditorialItem[] = [];
  const issues: DailyAiEditorialIssue[] = [];
  for (const [index, entry] of (value as unknown[]).entries()) {
    const invalidItem = invalidEditorialItemMessage(entry);
    if (invalidItem) {
      issues.push({ index, refs: [], reason: "invalid-item", message: invalidItem });
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

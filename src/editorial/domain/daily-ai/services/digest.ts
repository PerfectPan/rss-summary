import { canonicalizeUrl } from "../../../../kernel/text.js";
import { isSameEntityEvent } from "../../identity/index.js";
import type { CandidateProject } from "../../subscription/index.js";
import { DailyAiDraftValidationError } from "../errors/daily-ai-draft.js";
import { validateEditorialDraft } from "../policies/editorial-draft.js";
import {
  cleanDailyAiTitle,
  type DailyAiDecision,
  type DailyAiDigest,
  type DailyAiEditorialIssue,
  type DailyAiEditorialItem,
  type DailyAiEvidence,
} from "../value-objects/daily-ai.js";

/** Industry rows already carry their source name on the card. The caller supplies any badge. */
export function industryEvidence(candidates: readonly CandidateProject[]): DailyAiEvidence[] {
  return candidates.flatMap((candidate) => {
    if (candidate.category === "paper") return [];
    const event = candidate.events[0];
    const title = candidate.label ?? event?.title;
    const url = candidate.url ?? event?.htmlUrl;
    if (!event || !title || !url) return [];
    return [
      {
        id: `official:${event.id}`,
        title: cleanDailyAiTitle(title),
        url,
        publishedAt: event.createdAt,
        excerpt: candidate.description ?? event.summary ?? title,
        tier: "official" as const,
        sourceName: event.sourceName ?? event.actor,
      },
    ];
  });
}

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
    items = validation.items;
    editorialIssues = validation.issues;
    if (items.length === 0 && editorialIssues.length > 0) {
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

function cleanText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

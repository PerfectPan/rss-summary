export const dailyAiCategories = [
  "概览/要闻",
  "模型发布",
  "开发生态",
  "产品应用",
  "行业动态",
  "技术与洞察",
] as const;

export type DailyAiCategory = (typeof dailyAiCategories)[number];
export type DailyAiSourceTier = "official" | "authoritative" | "aggregator" | "unverified";

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

export type DailyAiDigest = {
  evidence: DailyAiEvidence[];
  items: DailyAiEditorialItem[];
  audit: { decisions: DailyAiDecision[]; editorialIssues: DailyAiEditorialIssue[] };
};

export function cleanDailyAiTitle(title: string): string {
  return title
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[。.!！]+$/u, "");
}

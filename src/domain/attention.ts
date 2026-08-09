import type { CandidateProject } from "./digest.js";

export type PresentationDepth = "link" | "summary" | "research";

const importantContentPatterns = [
  /(?:重大版本|正式发布|正式上线|开放公测|公开预览|全面可用|重大变更|破坏性变更|不兼容|弃用|停止支持)/u,
  /(?:安全漏洞|高危漏洞|供应链攻击|数据泄露|重大故障|大规模中断)/u,
  /\b(?:general availability|generally available|public preview|major release|breaking changes?|deprecated|deprecation|end of support)\b/iu,
  /\b(?:critical vulnerability|security advisory|security update|supply-chain attack|data breach|major outage)\b/iu,
  /\bCVE-\d{4}-\d{4,}\b/iu,
];

/** Decide how much space a candidate deserves without coupling ranking to Markdown. */
export function presentationDepthForCandidate(candidate: CandidateProject): PresentationDepth {
  if (candidate.category === "paper") return "research";
  if (candidate.reasons.some((reason) => reason.startsWith("matches interest: "))) {
    return "summary";
  }
  if (hasImportantContent(candidate)) return "summary";
  return "link";
}

function hasImportantContent(candidate: CandidateProject): boolean {
  const content = [
    candidate.label,
    candidate.description,
    candidate.repository?.description,
    ...(candidate.repository?.topics ?? []),
    ...candidate.events.flatMap((event) => [event.title, event.summary, ...(event.tags ?? [])]),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return importantContentPatterns.some((pattern) => pattern.test(content));
}

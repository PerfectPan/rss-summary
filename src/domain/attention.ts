import type { CandidateProject } from "./digest.js";

export type PresentationDepth = "link" | "summary" | "research";

export type PresentationReasonCode =
  | "ordinary-update"
  | "semantic-summary"
  | "interest-match"
  | "major-release"
  | "breaking-change"
  | "deprecation"
  | "security-event"
  | "service-incident"
  | "paper-research";

export type PresentationDecision = {
  depth: PresentationDepth;
  reasonCode: PresentationReasonCode;
  evidence?: string;
};

const importantContentRules: Array<{
  reasonCode: Exclude<
    PresentationReasonCode,
    "ordinary-update" | "interest-match" | "paper-research"
  >;
  pattern: RegExp;
}> = [
  {
    reasonCode: "security-event",
    pattern:
      /(?:安全漏洞|高危漏洞|供应链攻击|数据泄露)|\b(?:critical vulnerability|security advisory|security update|supply-chain attack|data breach)\b|\bCVE-\d{4}-\d{4,}\b/iu,
  },
  {
    reasonCode: "service-incident",
    pattern: /(?:重大故障|大规模中断)|\bmajor outage\b/iu,
  },
  {
    reasonCode: "breaking-change",
    pattern: /(?:重大变更|破坏性变更|不兼容)|\bbreaking changes?\b/iu,
  },
  {
    reasonCode: "deprecation",
    pattern: /(?:弃用|停止支持)|\b(?:deprecated|deprecation|end of support)\b/iu,
  },
  {
    reasonCode: "major-release",
    pattern:
      /(?:重大版本|正式发布|正式上线|开放公测|公开预览|全面可用)|\b(?:general availability|generally available|public preview|major release)\b/iu,
  },
];

/** Decide how much space a candidate deserves without coupling ranking to Markdown. */
export function presentationDepthForCandidate(candidate: CandidateProject): PresentationDepth {
  return presentationDecisionForCandidate(candidate).depth;
}

export function presentationDecisionForCandidate(
  candidate: CandidateProject,
): PresentationDecision {
  if (candidate.category === "paper") return { depth: "research", reasonCode: "paper-research" };
  const interest = candidate.matchedInterests?.[0];
  if (interest) return { depth: "summary", reasonCode: "interest-match", evidence: interest };
  const content = [
    candidate.label,
    candidate.description,
    candidate.repository?.description,
    ...(candidate.repository?.topics ?? []),
    ...candidate.events.flatMap((event) => [event.title, event.summary, ...(event.tags ?? [])]),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  for (const rule of importantContentRules) {
    const match = rule.pattern.exec(content);
    if (match) return { depth: "summary", reasonCode: rule.reasonCode, evidence: match[0] };
  }
  if (candidate.category === "article" || candidate.eventTypes.includes("pull_request")) {
    return { depth: "summary", reasonCode: "semantic-summary" };
  }
  return { depth: "link", reasonCode: "ordinary-update" };
}

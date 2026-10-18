import { formatCompactCount } from "../../../../kernel/text.js";
import type {
  CandidatePresentationSections,
  CandidateProject,
  PresentationDecision,
  PresentationDepth,
  PresentationPolicy,
  PresentationReasonCode,
} from "../value-objects/candidate.js";

export const DEFAULT_LINK_SECTION_LIMIT = 20;
export const DEFAULT_SUMMARY_SECTION_LIMIT = 8;

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
export function presentationDepthForCandidate(
  candidate: CandidateProject,
  policy: PresentationPolicy = {},
): PresentationDepth {
  return presentationDecisionForCandidate(candidate, policy).depth;
}

export function presentationDecisionForCandidate(
  candidate: CandidateProject,
  policy: PresentationPolicy = {},
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
  if (
    policy.semanticSummaries &&
    (candidate.category === "article" || candidate.eventTypes.includes("pull_request"))
  ) {
    return { depth: "summary", reasonCode: "semantic-summary" };
  }
  return { depth: "link", reasonCode: "ordinary-update" };
}

export function repositoryFactsForCandidate(candidate: CandidateProject): string[] {
  if (!candidate.repository || candidate.category !== "discovery") return [];
  return [
    `⭐ ${formatCompactCount(candidate.repository.stargazersCount)}`,
    candidate.repository.language ?? undefined,
  ].filter((value): value is string => Boolean(value));
}

/** Select the exact bounded candidates that a brief can render. */
export function selectCandidatePresentationSections(
  candidates: CandidateProject[],
  policy: PresentationPolicy = {},
): CandidatePresentationSections {
  const publishable = candidates.filter((candidate) => candidate.category !== "paper");
  return {
    summaries: publishable
      .filter((candidate) => presentationDepthForCandidate(candidate, policy) === "summary")
      .slice(0, policy.summaryLimit ?? DEFAULT_SUMMARY_SECTION_LIMIT),
    links: publishable
      .filter((candidate) => presentationDepthForCandidate(candidate, policy) === "link")
      .slice(0, policy.linkLimit ?? DEFAULT_LINK_SECTION_LIMIT),
  };
}

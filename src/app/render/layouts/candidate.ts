import {
  repositoryFactsForCandidate,
  selectCandidatePresentationSections,
  type CandidateProject,
} from "../../../editorial/index.js";
import { subscriptionEvidenceId } from "../../products/subscriptions/output.js";
import type { ViewDocument, ViewItem } from "../view.js";

export type CandidateCopy = {
  facts: string[];
  label: string;
  url: string;
  source: string;
  oneLine: string;
  summary: string;
};

export type CandidateCopyOptions = {
  editorialSummary?: string;
};

export function candidateCopy(
  candidate: CandidateProject,
  options: CandidateCopyOptions = {},
): CandidateCopy {
  const label = candidate.label ?? candidate.repo;
  const url =
    candidate.url ?? candidate.repository?.htmlUrl ?? `https://github.com/${candidate.repo}`;
  const source = candidate.actors.join(", ") || candidate.events[0]?.sourceName || "未知来源";
  const facts = repositoryFactsForCandidate(candidate);
  const oneLine = oneLineFor(candidate, label, facts);
  const fallback = candidate.repository?.description ?? oneLine;
  return {
    facts,
    label,
    url,
    source,
    oneLine,
    summary: boundedText(options.editorialSummary ?? candidate.description ?? fallback, 220),
  };
}

function oneLineFor(candidate: CandidateProject, label: string, facts: string[]): string {
  if (candidate.category === "article") return `发布了「${label}」。`;
  if (candidate.category === "release") return `发布了「${label}」。`;
  if (candidate.category === "discovery") {
    return facts.length > 0 ? `${label} · ${facts.join(" · ")}` : label;
  }
  const event = candidate.events[0];
  if (event?.type === "pull_request") {
    const number = event.prNumber ? ` #${event.prNumber}` : "";
    return `PR${number}${event.title ? ` · ${boundedText(event.title, 100)}` : ""}`;
  }
  const eventTitle = event?.title;
  return eventTitle
    ? `${candidate.repo} 更新了「${boundedText(eventTitle, 100)}」。`
    : `${candidate.repo} 有一条新的项目动态。`;
}

function boundedText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}

export type CandidateBriefLayoutOptions = {
  header: string;
  metadata: string;
  candidates: CandidateProject[];
  featuredTitle: string;
  compactTitle: string;
  emptyMessage: string;
  pendingMessage: (count: number) => string;
  semanticSummaries?: boolean;
  summaryLimit?: number;
  summaries?: ReadonlyMap<string, string>;
};

/** Lay a subscription/frontier candidate selection out as a View IR brief. */
export function candidateBriefView(options: CandidateBriefLayoutOptions): ViewDocument {
  const publishable = options.candidates.filter((candidate) => candidate.category !== "paper");
  const sections = selectCandidatePresentationSections(options.candidates, {
    semanticSummaries: options.semanticSummaries,
    summaryLimit: options.summaryLimit,
  });
  const pendingPapers = options.candidates.length - publishable.length;
  const viewSections = [
    ...(sections.summaries.length > 0
      ? [
          {
            heading: options.featuredTitle,
            style: "strong" as const,
            items: sections.summaries.map((candidate) =>
              featuredItem(candidate, options.summaries),
            ),
          },
        ]
      : []),
    ...(sections.links.length > 0
      ? [
          {
            heading: options.compactTitle,
            style: "strong" as const,
            items: sections.links.map((candidate) => bulletItem(candidate)),
          },
        ]
      : []),
  ];
  const trailing = [
    ...(publishable.length === 0 && pendingPapers === 0
      ? [{ kind: "plain" as const, text: options.emptyMessage }]
      : []),
    ...(pendingPapers > 0
      ? [{ kind: "plain" as const, text: options.pendingMessage(pendingPapers) }]
      : []),
  ];
  return {
    title: options.header.replace(/^#\s+/u, ""),
    meta: [options.metadata],
    sections: viewSections,
    trailing,
    variant: "brief",
  };
}

function featuredItem(
  candidate: CandidateProject,
  summaries?: ReadonlyMap<string, string>,
): ViewItem {
  const copy = candidateCopy(candidate, {
    editorialSummary: summaries?.get(subscriptionEvidenceId(candidate)),
  });
  return {
    shape: "featured",
    headline: copy.label,
    links: [{ text: copy.label, url: copy.url }],
    notes: [...(copy.facts.length > 0 ? [copy.facts.join(" · ")] : []), copy.summary],
    sourceLabel: copy.source,
  };
}

function bulletItem(candidate: CandidateProject): ViewItem {
  const copy = candidateCopy(candidate);
  return {
    shape: "bullet",
    headline: copy.oneLine,
    links: [{ text: `${copy.source} ↗`, url: copy.url }],
    notes: [],
  };
}

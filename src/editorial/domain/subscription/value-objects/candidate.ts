import type {
  ActivityCardDto,
  ActivitySource,
  ActivityType,
  RepositoryMetadata,
} from "../../../../acquisition/index.js";

export type ActivityCard = ActivityCardDto;

export type CandidateProject = {
  repo: string;
  source: ActivitySource;
  category: "discovery" | "release" | "activity" | "article" | "paper";
  score: number;
  actors: string[];
  eventTypes: ActivityType[];
  reasons: string[];
  matchedInterests?: string[];
  events: ActivityCard[];
  repository?: RepositoryMetadata;
  label?: string;
  url?: string;
  description?: string;
};

export type ScoreOptions = {
  interests: readonly string[];
  now: number;
};

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

export type PresentationPolicy = {
  linkLimit?: number;
  semanticSummaries?: boolean;
  summaryLimit?: number;
};

export type CandidatePresentationSections = {
  links: CandidateProject[];
  summaries: CandidateProject[];
};

export type EditorialSelectionDecision = {
  ref: string;
  selected: boolean;
  reason: string;
};

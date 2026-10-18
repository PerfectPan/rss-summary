import type { CredibilityMethod, CredibilityTier } from "../../../../acquisition/index.js";

export type NewsSourcePolicy = "authoritative" | "official" | "news";

export type NewsBriefEdition = "noon" | "evening";

export type NewsQueryIntent =
  | "model-release"
  | "developer-change"
  | "service-incident"
  | "security-advisory"
  | "policy-action"
  | "capital-event";

export type NewsTopicQuery = {
  id: string;
  text: string;
  intent: NewsQueryIntent;
  subjectAny: string[];
  eventAny: string[];
  excludedAny: string[];
};

export type NewsTopic = {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  sourcePolicy: NewsSourcePolicy;
  maxItems: number;
  queries: NewsTopicQuery[];
};

/** Item credibility plus the numeric certificate the story field still publishes. */
export type NewsCredibility = {
  tier: CredibilityTier;
  method?: CredibilityMethod;
  rank: number;
};

export type NewsSearchHit = {
  id: string;
  title: string;
  siteName?: string;
  url: string;
  snippet?: string;
  summary?: string;
  publishTime?: string;
  rankScore?: number;
  authInfoDescription?: string;
  credibility: { tier: CredibilityTier; method?: CredibilityMethod };
  authorityRank: number;
  topicId: string;
  topicLabel: string;
  sourcePolicy: NewsSourcePolicy;
  queryId: string;
  queryText: string;
  subjectAny: string[];
  eventAny: string[];
  excludedAny: string[];
  rankPosition: number;
};

export type NewsScoreBreakdown = {
  rank: number;
  authority: number;
  freshness: number;
  crossQuery: number;
};

export type NewsStory = {
  id: string;
  title: string;
  canonicalUrl: string;
  summary: string;
  siteName: string;
  publishTime: string;
  rankScore: number;
  authInfoLevel: number;
  authInfoDescription?: string;
  topicIds: string[];
  topicLabels: string[];
  queryIds: string[];
  queries: string[];
  queryHits: number;
  scoreBreakdown: NewsScoreBreakdown;
  score: number;
};

export type SelectedNewsStory = NewsStory & {
  selectedTopicId: string;
};

export type NewsStorySelectionReason =
  | "duplicate-title"
  | "topic-quota"
  | "brief-cap"
  | "no-enabled-topic";

export type NewsStoryDecision = {
  story: NewsStory;
  status: "selected" | "filtered";
  reason?: NewsStorySelectionReason;
};

export type NewsStorySelectionResult = {
  stories: SelectedNewsStory[];
  decisions: NewsStoryDecision[];
};

export type NewsTimeWindow = {
  since: number;
  until: number;
  reportedUrls?: string[];
  timezoneOffset?: string;
};

export type NewsHitRejectionReason =
  | "missing-fields"
  | "invalid-publish-time"
  | "outside-window"
  | "insufficient-authority"
  | "already-reported"
  | "excluded-content"
  | "subject-mismatch"
  | "intent-mismatch"
  | "invalid-url";

export type NewsHitDecision = {
  hit: NewsSearchHit;
  status: "accepted" | "rejected";
  reason?: NewsHitRejectionReason;
  canonicalUrl?: string;
};

export type NewsStoryBuildResult = {
  stories: NewsStory[];
  decisions: NewsHitDecision[];
};

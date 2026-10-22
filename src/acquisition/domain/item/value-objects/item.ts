export type ItemId = string;

export type SubjectKey = string;

export type ItemKind = "publication" | "paper" | "release" | "change" | "project" | "post";

/**
 * One signal per row of the existing base score table. Names describe the
 * signal, not the source that produced it.
 */
export type SignalType =
  | "endorsed"
  | "recommended-trending"
  | "recommended-personal"
  | "announced"
  | "released"
  | "forked"
  | "created"
  | "relationship"
  | "published-article"
  | "published-paper"
  | "change-merged"
  | "change-opened"
  | "change-closed"
  | "change-other";

export type CredibilityTier = "official" | "authoritative" | "aggregator" | "unrated";

export type CredibilityMethod = "configured-domain" | "article-read";

export type TimePrecision = "instant" | "date";

export type Item = {
  id: ItemId;
  kind: ItemKind;
  subject: {
    key: SubjectKey;
    name: string;
    url?: string;
    profile?: {
      description?: string;
      keywords: string[];
      popularity?: number;
      lastActiveAt?: string;
    };
  };
  content: { title?: string; excerpt?: string; url?: string; keywords?: string[] };
  publishedAt: { value: string; precision: TimePrecision };
  provenance: {
    origin: string;
    actor?: { name: string; followed: boolean };
    note?: string;
  };
  credibility: { tier: CredibilityTier; method?: CredibilityMethod };
  signals: ReadonlyArray<{ type: SignalType; label: string }>;
  rank?: { position: number; score?: number };
  display: { label?: string; reference?: string; facts: string[] };
  /**
   * Opaque grouping and pass-through values written by adapters.
   * Editorial compares and copies them; it does not parse them.
   */
  routing?: ItemRouting;
};

export type ItemRouting = {
  groupKey: string;
  channel: string;
  channelRank: number;
  contentResearch: boolean;
  feedPrefix: string;
  sitePrefix: string;
  catalogResearchKey: string;
  role: "publication" | "change" | "other";
  titleLabel?: string;
  prSuffix?: string;
  strippedRepo: string;
  directUrl?: string;
  description?: string;
  fallbackUrl: string;
  /** Pass-through repository record. Key order is the adapter's. */
  record?: {
    fullName: string;
    htmlUrl: string;
    description: string | null;
    language: string | null;
    stargazersCount: number;
    topics: string[];
    pushedAt: string | null;
  };
};

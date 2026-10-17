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
  content: { title?: string; excerpt?: string; url?: string };
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
};

/**
 * The historical activity card: the CLI `--json` output exposes it and the
 * ranking/identity schemes still read its fields, so the shape lives beside
 * the Item model. Source services spell the `source` values; this type keeps
 * the field open instead of naming any provider.
 */
export type ActivityCardDto = {
  id: string;
  type: ActivityType;
  source?: string;
  actor: string;
  repo: string;
  createdAt: string;
  action?: string;
  prNumber?: number;
  detailUrl?: string;
  htmlUrl?: string;
  title?: string;
  summary?: string;
  sourceName?: string;
  sourceUrl?: string;
  tags?: string[];
};

/**
 * Which source family produced the card. Historically a closed set of
 * provider names; the integrations own those spellings now, so the card keeps
 * the field open and consumers compare values, not literals.
 */
export type ActivitySource = string;

export type ActivityType =
  | "watch"
  | "pull_request"
  | "release"
  | "fork"
  | "create"
  | "trending"
  | "recommendation"
  | "follow"
  | "announcement"
  | "article"
  | "paper"
  | "other";

export type RepositoryMetadata = {
  fullName: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  stargazersCount: number;
  topics: string[];
  pushedAt: string | null;
};

export type PullRequestDetails = {
  title: string;
  htmlUrl: string;
  body: string | null;
};

export type Acquired = {
  item: import("./item.js").Item;
  card: ActivityCardDto;
};

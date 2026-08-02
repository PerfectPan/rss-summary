import { asRecord, number, text } from "./parsing.js";

export type GitHubSearchRepo = {
  fullName: string;
  htmlUrl: string;
  description?: string;
  language?: string;
  stars: number;
  createdAt: string;
  topics: string[];
};

export type GitHubRepositorySearchInput = {
  query: string;
  perPage: number;
  sort?: "stars" | "created" | "updated";
  order?: "asc" | "desc";
};

export type GitHubSearchClientOptions = {
  token?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export class GitHubSearchClient {
  private readonly token?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: GitHubSearchClientOptions = {}) {
    this.token = options.token;
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async searchRepositories(input: GitHubRepositorySearchInput): Promise<GitHubSearchRepo[]> {
    const url = new URL("https://api.github.com/search/repositories");
    url.searchParams.set("q", input.query);
    url.searchParams.set("per_page", String(input.perPage));
    url.searchParams.set("sort", input.sort ?? "stars");
    url.searchParams.set("order", input.order ?? "desc");

    const response = await this.fetchImpl(url, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`GitHub Search API ${response.status}`);
    const page = await response.json();
    const items = asRecord(page).items;
    return Array.isArray(items)
      ? items.map(parseRepo).filter((item): item is GitHubSearchRepo => item !== undefined)
      : [];
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "rss-summary",
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    return headers;
  }
}

/**
 * Build a repository search query.
 *
 * GitHub rejects unparenthesized qualifier OR (`language:A OR language:B` → 422) and
 * parenthesized qualifier groups often return empty hits, so free-text OR is used.
 * Prefer topic terms over language names: free-text "TypeScript" matches any TS repo
 * and drowns out AI×dev signal. Languages remain a scoring bias in the domain layer.
 */
export function buildRepositorySearchQuery(options: {
  since: string;
  minStars: number;
  /** Free-text OR terms (prefer topics / product keywords, not language names). */
  keywords: string[];
}): string {
  const qualifiers = [`created:>=${options.since}`, `stars:>${options.minStars}`];
  if (options.keywords.length > 0) qualifiers.push(options.keywords.join(" OR "));
  return qualifiers.join(" ");
}

function parseRepo(value: unknown): GitHubSearchRepo | undefined {
  const item = asRecord(value);
  const fullName = text(item.full_name);
  const htmlUrl = text(item.html_url);
  if (!fullName || !htmlUrl) return undefined;
  return {
    fullName,
    htmlUrl,
    description: text(item.description),
    language: text(item.language),
    stars: number(item.stargazers_count) ?? 0,
    createdAt: text(item.created_at) ?? "",
    topics: Array.isArray(item.topics)
      ? item.topics.map(text).filter((topic): topic is string => topic !== undefined)
      : [],
  };
}

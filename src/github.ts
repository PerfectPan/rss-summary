import type { RepositoryMetadata } from "./domain.js";

export type GitHubClientOptions = {
  token?: string;
  fetch?: typeof fetch;
};

export type PaginationOptions = {
  perPage: number;
  pages: number;
};

export class GitHubClient {
  private readonly token?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GitHubClientOptions = {}) {
    this.token = options.token;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async getReceivedEvents(username: string, pagination: PaginationOptions): Promise<unknown[]> {
    const pages = await Promise.all(
      Array.from({ length: pagination.pages }, (_, index) =>
        this.getJson<unknown[]>(
          `/users/${encodeURIComponent(username)}/received_events?per_page=${pagination.perPage}&page=${
            index + 1
          }`,
        ),
      ),
    );
    return pages.flat();
  }

  async getFollowing(pagination: PaginationOptions = { perPage: 100, pages: 3 }): Promise<Set<string>> {
    const pages = await Promise.all(
      Array.from({ length: pagination.pages }, (_, index) =>
        this.getJson<Array<{ login?: string }>>(`/user/following?per_page=${pagination.perPage}&page=${index + 1}`),
      ),
    );
    return new Set(pages.flat().map((item) => item.login).filter((login): login is string => Boolean(login)));
  }

  async getRepository(fullName: string): Promise<RepositoryMetadata> {
    const raw = await this.getJson<{
      full_name: string;
      html_url: string;
      description: string | null;
      language: string | null;
      stargazers_count: number;
      topics?: string[];
      pushed_at: string | null;
    }>(`/repos/${fullName}`);

    return {
      fullName: raw.full_name,
      htmlUrl: raw.html_url,
      description: raw.description,
      language: raw.language,
      stargazersCount: raw.stargazers_count,
      topics: raw.topics ?? [],
      pushedAt: raw.pushed_at,
    };
  }

  async getPullRequest(fullName: string, number: number): Promise<{ title: string; htmlUrl: string; body: string | null }> {
    const raw = await this.getJson<{ title: string; html_url: string; body: string | null }>(
      `/repos/${fullName}/pulls/${number}`,
    );
    return { title: raw.title, htmlUrl: raw.html_url, body: raw.body };
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(`https://api.github.com${path}`, {
      headers: this.headers(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API ${response.status} for ${path}: ${text.slice(0, 300)}`);
    }

    return (await response.json()) as T;
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

export type HackerNewsStory = {
  id: string;
  title: string;
  url?: string;
  points: number;
  numComments: number;
  createdAt: string;
  isShowHn: boolean;
  author: string;
};

export type HackerNewsSearchInput = {
  minPoints: number;
  includeShowHn: boolean;
  maxItems: number;
};

export type HackerNewsClientOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export class HackerNewsClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: HackerNewsClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "https://hn.algolia.com/api/v1";
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async searchStories(input: HackerNewsSearchInput): Promise<HackerNewsStory[]> {
    const tags = input.includeShowHn ? "(story,show_hn)" : "story";
    const url = new URL(`${this.baseUrl}/search_by_date`);
    url.searchParams.set("tags", tags);
    url.searchParams.set("numericFilters", `points>${input.minPoints}`);
    url.searchParams.set("hitsPerPage", String(Math.min(Math.max(input.maxItems * 3, 20), 100)));

    const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    if (!response.ok) throw new Error(`Hacker News API HTTP ${response.status}`);
    const page = parsePage(await response.json());
    return page.hits;
  }
}

function parsePage(value: unknown): { hits: HackerNewsStory[] } {
  const root = asRecord(value);
  const hits = Array.isArray(root.hits) ? root.hits.map(parseStory).filter((item): item is HackerNewsStory => item !== undefined) : [];
  return { hits };
}

function parseStory(value: unknown): HackerNewsStory | undefined {
  const item = asRecord(value);
  const id = text(item.objectID);
  const title = text(item.title);
  if (!id || !title) return undefined;
  const tags = Array.isArray(item._tags) ? item._tags.map(text).filter(Boolean) : [];
  return {
    id,
    title,
    url: text(item.url) ?? hnItemUrl(id),
    points: number(item.points) ?? 0,
    numComments: number(item.num_comments) ?? 0,
    createdAt: text(item.created_at) ?? "",
    isShowHn: tags.includes("show_hn"),
    author: text(item.author) ?? "unknown",
  };
}

function hnItemUrl(id: string): string {
  return `https://news.ycombinator.com/item?id=${encodeURIComponent(id)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  return undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

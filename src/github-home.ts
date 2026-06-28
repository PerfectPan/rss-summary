import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline/promises";

import type { ActivityCard, ActivityType } from "./domain.js";

export type HomeFeedLinkSnapshot = {
  text: string;
  href: string;
};

export type HomeFeedCardSnapshot = {
  id: string;
  card: Record<string, unknown> | null;
  text: string;
  links: HomeFeedLinkSnapshot[];
};

export type GithubHomeClientOptions = {
  storageState: string;
  headless?: boolean;
  browserChannel?: string;
  timeoutMs?: number;
};

type PlaywrightModule = typeof import("playwright");

const githubHomeUrl = "https://github.com/";

export class GitHubHomeClient {
  private readonly storageState: string;
  private readonly headless: boolean;
  private readonly browserChannel?: string;
  private readonly timeoutMs: number;

  constructor(options: GithubHomeClientOptions) {
    this.storageState = options.storageState;
    this.headless = options.headless ?? true;
    this.browserChannel = options.browserChannel ?? "chrome";
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async getHomeEvents(): Promise<ActivityCard[]> {
    if (!existsSync(this.storageState)) {
      throw new Error(
        `GitHub Home storage state not found: ${this.storageState}. Run 'rss-summary github-home login' first.`,
      );
    }

    const playwright = await import("playwright");
    const browser = await launchBrowser(playwright, {
      headless: this.headless,
      browserChannel: this.browserChannel,
    });

    try {
      const context = await browser.newContext({ storageState: this.storageState });
      const page = await context.newPage();
      await page.goto(githubHomeUrl, { waitUntil: "domcontentloaded", timeout: this.timeoutMs });

      if (page.url().includes("/login")) {
        throw new Error(
          `GitHub Home login is required. Run 'rss-summary github-home login' to refresh ${this.storageState}.`,
        );
      }

      await page.waitForSelector("#conduit-feed-frame article.js-feed-item-component", { timeout: this.timeoutMs });
      const snapshots = await page.evaluate(extractHomeFeedSnapshots);
      return normalizeHomeCardSnapshots(snapshots);
    } finally {
      await browser.close();
    }
  }
}

export async function saveGithubHomeStorageState(options: {
  storageState: string;
  browserChannel?: string;
}): Promise<void> {
  const playwright = await import("playwright");
  const browser = await launchBrowser(playwright, {
    headless: false,
    browserChannel: options.browserChannel ?? "chrome",
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(githubHomeUrl, { waitUntil: "domcontentloaded" });

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      await rl.question(
        `Sign in to GitHub in the opened browser, make sure https://github.com/ shows Home, then press Enter here to save ${options.storageState}.`,
      );
    } finally {
      rl.close();
    }

    if (page.url().includes("/login")) {
      throw new Error("GitHub Home is still on the login page; sign in before saving the storage state.");
    }

    mkdirSync(dirname(options.storageState), { recursive: true });
    await context.storageState({ path: options.storageState });
  } finally {
    await browser.close();
  }
}

export function normalizeHomeCardSnapshots(cards: HomeFeedCardSnapshot[]): ActivityCard[] {
  return cards.map(normalizeHomeCardSnapshot).filter((card) => card.type !== "other");
}

export function normalizeHomeCardSnapshot(snapshot: HomeFeedCardSnapshot): ActivityCard {
  const cardType = stringField(snapshot.card, "card_type");
  const createdAt = stringField(snapshot.card, "created_at");
  const pullRequest = findPullRequestLink(snapshot.links);
  const repository = pullRequest?.repo ? { fullName: pullRequest.repo, htmlUrl: repoUrl(pullRequest.repo) } : findRepositoryLink(snapshot.links);
  const normalized = normalizeHomeCardType(cardType);
  const actor = usesSyntheticActor(normalized.type) ? "GitHub Home" : findActor(snapshot.links) ?? "GitHub Home";

  return {
    id: snapshot.id || fallbackId(cardType, repository?.fullName, createdAt),
    type: normalized.type,
    source: "github",
    actor,
    repo: repository?.fullName ?? "",
    createdAt,
    action: normalized.action,
    prNumber: pullRequest?.number,
    htmlUrl: pullRequest?.href ?? repository?.htmlUrl,
    title: pullRequest?.title ?? repository?.fullName,
    summary: cleanSummary(snapshot.text),
  };
}

function normalizeHomeCardType(cardType: string): { type: ActivityType; action: string } {
  if (cardType === "MERGED_PULL_REQUEST") return { type: "pull_request", action: "merged" };
  if (cardType === "PULL_REQUEST") return { type: "pull_request", action: "opened" };
  if (cardType === "FORKED_REPOSITORY") return { type: "fork", action: "forked" };
  if (cardType === "CREATED_REPOSITORY") return { type: "create", action: "created" };
  if (cardType === "STARRED_REPOSITORY") return { type: "watch", action: "started" };
  if (cardType === "TRENDING_REPOSITORY") return { type: "trending", action: "trending" };
  if (cardType === "REPOSITORY_RECOMMENDATION") return { type: "recommendation", action: "recommended" };
  if (cardType === "FOLLOWED_USER") return { type: "follow", action: "followed" };
  if (cardType === "ANNOUNCEMENT") return { type: "announcement", action: "announced" };
  if (cardType === "RELEASE") return { type: "release", action: "published" };
  return { type: "other", action: cardType.toLowerCase() };
}

function findPullRequestLink(links: HomeFeedLinkSnapshot[]):
  | {
      href: string;
      number: number;
      repo: string;
      title: string;
    }
  | undefined {
  for (const link of links) {
    const parsed = parseGithubUrl(link.href);
    if (!parsed || parsed.kind !== "pull") continue;
    return {
      href: link.href,
      number: parsed.number,
      repo: parsed.repo,
      title: link.text || `#${parsed.number}`,
    };
  }
  return undefined;
}

function findRepositoryLink(links: HomeFeedLinkSnapshot[]): { fullName: string; htmlUrl: string } | undefined {
  for (const link of links) {
    const parsed = parseGithubUrl(link.href);
    if (!parsed || parsed.kind !== "repo") continue;
    if (link.text && !link.text.includes("/")) continue;
    return { fullName: parsed.repo, htmlUrl: link.href };
  }
  return undefined;
}

function findActor(links: HomeFeedLinkSnapshot[]): string | undefined {
  for (const link of links) {
    const parsed = parseGithubUrl(link.href);
    if (!parsed || parsed.kind !== "user") continue;
    const login = link.text || parsed.login;
    if (!login || login === "See more" || login === "people you follow") continue;
    return login;
  }
  return undefined;
}

function usesSyntheticActor(type: ActivityType): boolean {
  return type === "trending" || type === "recommendation";
}

function parseGithubUrl(href: string):
  | { kind: "repo"; repo: string }
  | { kind: "pull"; repo: string; number: number }
  | { kind: "user"; login: string }
  | undefined {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }
  if (url.hostname !== "github.com") return undefined;
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 1) return { kind: "user", login: parts[0] ?? "" };
  if (parts.length >= 4 && parts[2] === "pull") {
    const number = Number(parts[3]);
    if (Number.isInteger(number)) return { kind: "pull", repo: `${parts[0]}/${parts[1]}`, number };
  }
  if (parts.length === 2) return { kind: "repo", repo: `${parts[0]}/${parts[1]}` };
  return undefined;
}

function cleanSummary(text: string): string | undefined {
  const cleaned = text.replace(/\s+/gu, " ").trim();
  return cleaned ? cleaned : undefined;
}

function repoUrl(fullName: string): string {
  return `https://github.com/${fullName}`;
}

function fallbackId(cardType: string, repo: string | undefined, createdAt: string): string {
  return `github-home:${cardType}:${repo ?? "unknown"}:${createdAt}`;
}

function stringField(record: Record<string, unknown> | null, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

async function launchBrowser(
  playwright: PlaywrightModule,
  options: { headless: boolean; browserChannel?: string },
): Promise<Awaited<ReturnType<PlaywrightModule["chromium"]["launch"]>>> {
  try {
    return await playwright.chromium.launch({
      headless: options.headless,
      channel: options.browserChannel,
    });
  } catch (error) {
    if (!options.browserChannel) throw error;
    return playwright.chromium.launch({ headless: options.headless });
  }
}

function extractHomeFeedSnapshots(): HomeFeedCardSnapshot[] {
  return Array.from(document.querySelectorAll("#conduit-feed-frame article.js-feed-item-component")).map((article) => {
    let card: Record<string, unknown> | null = null;
    try {
      const hydro = JSON.parse(article.getAttribute("data-hydro-view") || "null") as {
        payload?: { feed_card?: Record<string, unknown> };
      } | null;
      card = hydro?.payload?.feed_card ?? null;
    } catch {
      card = null;
    }

    const links = Array.from(article.querySelectorAll("a[href]")).map((link) => ({
      text: (link.textContent || "").replace(/\s+/gu, " ").trim(),
      href: (link as HTMLAnchorElement).href,
    }));

    return {
      id: article.id || "",
      card,
      text: (article.textContent || "").replace(/\s+/gu, " ").trim(),
      links,
    };
  });
}

import { existsSync } from "node:fs";

import {
  normalizeHomeCardSnapshots,
  type HomeFeedCardSnapshot,
} from "../../domain/item/adapters/github-home.js";
import type { ActivityCardDto } from "../../domain/item/adapters/activity-card.js";
import { readConduitSnapshots, readRenderedSnapshots, saveLoginStorageState } from "./browser.js";

export type HomeFeedSnapshotFetcher = () => Promise<HomeFeedCardSnapshot[]>;

export type GithubHomeFetchMode = "conduit" | "browser";

export type GithubHomeClientOptions = {
  storageState: string;
  fetchMode?: GithubHomeFetchMode;
  headless?: boolean;
  browserChannel?: string;
  timeoutMs?: number;
  conduitFetcher?: HomeFeedSnapshotFetcher;
  browserFetcher?: HomeFeedSnapshotFetcher;
};

export class GitHubHomeClient {
  private readonly storageState: string;
  private readonly fetchMode: GithubHomeFetchMode;
  private readonly headless: boolean;
  private readonly browserChannel?: string;
  private readonly timeoutMs: number;
  private readonly conduitFetcher: HomeFeedSnapshotFetcher;
  private readonly browserFetcher: HomeFeedSnapshotFetcher;

  constructor(options: GithubHomeClientOptions) {
    this.storageState = options.storageState;
    this.fetchMode = options.fetchMode ?? "conduit";
    this.headless = options.headless ?? true;
    this.browserChannel = options.browserChannel ?? "chrome";
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.conduitFetcher =
      options.conduitFetcher ?? (() => readConduitSnapshots(this.storageState, this.timeoutMs));
    this.browserFetcher =
      options.browserFetcher ??
      (() =>
        readRenderedSnapshots(this.storageState, this.timeoutMs, {
          headless: this.headless,
          browserChannel: this.browserChannel,
        }));
  }

  async getHomeEvents(): Promise<ActivityCardDto[]> {
    if (!existsSync(this.storageState)) {
      throw new Error(
        `GitHub Home storage state not found: ${this.storageState}. Run 'rss-summary github-home login' first.`,
      );
    }

    if (this.fetchMode === "browser") {
      return normalizeHomeCardSnapshots(await this.browserFetcher());
    }

    try {
      const events = normalizeHomeCardSnapshots(await this.conduitFetcher());
      if (events.length === 0) {
        throw new Error("GitHub conduit feed returned no supported Home cards.");
      }
      return events;
    } catch {
      return normalizeHomeCardSnapshots(await this.browserFetcher());
    }
  }
}

/* v8 ignore start -- Playwright login flow, exercised manually */
export async function saveGithubHomeStorageState(options: {
  storageState: string;
  browserChannel?: string;
}): Promise<void> {
  await saveLoginStorageState(options);
}
/* v8 ignore stop */

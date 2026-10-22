import type { FeedSubscription, FeedSubscriptionInput, IndustrySource } from "../index.js";

export function addFeedSubscription(
  feeds: readonly FeedSubscription[],
  input: FeedSubscriptionInput,
): FeedSubscription[] {
  const next = normalizeFeedSubscription(input);
  if (feeds.some((feed) => feed.url === next.url)) {
    throw new Error(`RSS feed already exists: ${next.url}`);
  }
  return [...feeds, next];
}

export function removeFeedSubscription(
  feeds: readonly FeedSubscription[],
  url: string,
): FeedSubscription[] {
  const normalizedUrl = url.trim();
  const next = feeds.filter((feed) => feed.url !== normalizedUrl);
  if (next.length === feeds.length) {
    throw new Error(`RSS feed not found: ${normalizedUrl}`);
  }
  return next;
}

export function formatFeedSubscriptions(feeds: readonly FeedSubscription[]): string {
  return `${JSON.stringify(feeds, null, 2)}\n`;
}

export function parseFeedSubscriptions(value: string): FeedSubscription[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("RSS feed configuration must be a JSON array.");
  }

  return parsed.map((item) => {
    if (typeof item === "string") {
      return {
        name: hostnameOf(item),
        url: item,
        tags: [],
      };
    }

    if (!item || typeof item !== "object") {
      throw new Error("Each RSS feed must be a URL string or an object.");
    }

    const record = item as Record<string, unknown>;
    if (record.type !== undefined && record.type !== "rss") {
      throw new Error("Personal feed configuration only supports RSS or Atom sources.");
    }
    return parseFeedSubscriptionRecord(record);
  });
}

export function parseIndustrySources(value: string): IndustrySource[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("Industry source configuration must be a JSON array.");
  }

  return parsed.map((item) => {
    if (typeof item === "string") {
      return {
        name: hostnameOf(item),
        url: item,
        tags: [],
      };
    }
    if (!item || typeof item !== "object") {
      throw new Error("Each industry source must be a URL string or an object.");
    }

    const record = item as Record<string, unknown>;
    if (record.type === undefined || record.type === "rss") {
      return parseFeedSubscriptionRecord(record);
    }
    if (record.type !== "page") {
      throw new Error("Industry source type must be either 'rss' or 'page'.");
    }

    const url = requireString(record.url, "Web page source url");
    ensureHttpUrl(url, "Web page source url");
    const pathPrefixes = parseStringArray(record.pathPrefixes, "Web page source pathPrefixes");
    if (pathPrefixes.length === 0 || pathPrefixes.some((prefix) => !prefix.startsWith("/"))) {
      throw new Error("Web page source pathPrefixes must contain absolute path prefixes.");
    }

    return {
      type: "page",
      name: optionalName(record.name, url),
      url,
      pathPrefixes,
      tags: parseStringArray(record.tags, "Web page source tags", false),
    };
  });
}

function normalizeFeedSubscription(input: FeedSubscriptionInput): FeedSubscription {
  const url = input.url.trim();
  if (!url) throw new Error("RSS feed url is required.");

  return {
    name: input.name?.trim() || hostnameOf(url),
    url,
    tags: [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))],
  };
}

function parseFeedSubscriptionRecord(record: Record<string, unknown>): FeedSubscription {
  const url = requireString(record.url, "RSS feed url");
  ensureHttpUrl(url, "RSS feed url");
  return {
    name: optionalName(record.name, url),
    url,
    tags: parseStringArray(record.tags, "RSS feed tags", false),
  };
}

function optionalName(value: unknown, url: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : hostnameOf(url);
}

function parseStringArray(value: unknown, label: string, required = true): string[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function ensureHttpUrl(value: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use http or https.`);
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function hostnameOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./u, "");
  } catch {
    return value;
  }
}

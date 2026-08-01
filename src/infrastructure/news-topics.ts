import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type NewsSourcePolicy = "authoritative" | "official";

export type NewsTopic = {
  id: string;
  label: string;
  enabled: boolean;
  sourcePolicy: NewsSourcePolicy;
  maxItems: number;
  queries: string[];
};

const defaultTopicsFile = fileURLToPath(new URL("../../news-topics.json", import.meta.url));
const topicIdPattern = /^[a-z][a-z0-9-]*$/u;
const newsTopicLimits = {
  maxItemsPerTopic: 10,
  maxQueriesPerTopic: 8,
  maxTopics: 8,
  maxTotalQueries: 32,
} as const;

export function loadNewsTopics(filePath = defaultTopicsFile): NewsTopic[] {
  return parseNewsTopics(readFileSync(filePath, "utf8"));
}

export function parseNewsTopics(value: string): NewsTopic[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("News topic configuration must be a JSON array.");
  if (parsed.length > newsTopicLimits.maxTopics) {
    throw new Error(`News topic configuration supports at most ${newsTopicLimits.maxTopics} topics.`);
  }

  const ids = new Set<string>();
  const topics = parsed.map((item, index) => {
    const record = asRecord(item, `news topic ${index + 1}`);
    const id = requiredString(record.id, `news topic ${index + 1} id`);
    if (!topicIdPattern.test(id)) throw new Error(`News topic id must use kebab-case: ${id}`);
    if (ids.has(id)) throw new Error(`Duplicate news topic id: ${id}`);
    ids.add(id);

    const label = requiredString(record.label, `news topic ${id} label`);
    const enabled = optionalBoolean(record.enabled, true, `news topic ${id} enabled`);
    const sourcePolicy = parseSourcePolicy(record.sourcePolicy, id);
    const maxItems = positiveInteger(record.maxItems, 5, `news topic ${id} maxItems`);
    if (maxItems > newsTopicLimits.maxItemsPerTopic) {
      throw new Error(`News topic ${id} maxItems must not exceed ${newsTopicLimits.maxItemsPerTopic}.`);
    }
    if (!Array.isArray(record.queries) || record.queries.length === 0) {
      throw new Error(`News topic ${id} must define at least one query.`);
    }
    if (record.queries.length > newsTopicLimits.maxQueriesPerTopic) {
      throw new Error(
        `News topic ${id} supports at most ${newsTopicLimits.maxQueriesPerTopic} queries.`,
      );
    }
    const queries = record.queries.map((query, queryIndex) =>
      requiredString(query, `news topic ${id} query ${queryIndex + 1}`),
    );

    return { id, label, enabled, sourcePolicy, maxItems, queries };
  });
  const totalQueries = topics.reduce((total, topic) => total + topic.queries.length, 0);
  if (totalQueries > newsTopicLimits.maxTotalQueries) {
    throw new Error(`News topic configuration supports at most ${newsTopicLimits.maxTotalQueries} queries.`);
  }
  return topics;
}

function parseSourcePolicy(value: unknown, id: string): NewsSourcePolicy {
  if (value === "authoritative" || value === "official") return value;
  throw new Error(`News topic ${id} sourcePolicy must be authoritative or official.`);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function optionalBoolean(value: unknown, fallback: boolean, label: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
  return value;
}

function positiveInteger(value: unknown, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || Number(value) <= 0) throw new Error(`${label} must be a positive integer.`);
  return Number(value);
}

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { NewsSourcePolicy, NewsTopic } from "../domain/news.js";
import { optionalBoolean, requiredString, requirePositiveInteger } from "./config-parse.js";
import { requireRecord } from "./parsing.js";

const defaultTopicsFile = fileURLToPath(new URL("../../news-topics.json", import.meta.url));
const topicIdPattern = /^[a-z][a-z0-9-]*$/u;
const maxSearchQueryLength = 100;
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
    throw new Error(
      `News topic configuration supports at most ${newsTopicLimits.maxTopics} topics.`,
    );
  }

  const ids = new Set<string>();
  const topics = parsed.map((item, index) => {
    const record = requireRecord(item, `news topic ${index + 1}`);
    const id = requiredString(record.id, `news topic ${index + 1} id`);
    if (!topicIdPattern.test(id)) throw new Error(`News topic id must use kebab-case: ${id}`);
    if (ids.has(id)) throw new Error(`Duplicate news topic id: ${id}`);
    ids.add(id);

    const label = requiredString(record.label, `news topic ${id} label`);
    const enabled = optionalBoolean(record.enabled, true, `news topic ${id} enabled`);
    const sourcePolicy = parseSourcePolicy(record.sourcePolicy, id);
    const maxItems = requirePositiveInteger(record.maxItems, 5, `news topic ${id} maxItems`);
    if (maxItems > newsTopicLimits.maxItemsPerTopic) {
      throw new Error(
        `News topic ${id} maxItems must not exceed ${newsTopicLimits.maxItemsPerTopic}.`,
      );
    }
    if (!Array.isArray(record.queries) || record.queries.length === 0) {
      throw new Error(`News topic ${id} must define at least one query.`);
    }
    if (record.queries.length > newsTopicLimits.maxQueriesPerTopic) {
      throw new Error(
        `News topic ${id} supports at most ${newsTopicLimits.maxQueriesPerTopic} queries.`,
      );
    }
    const queries = record.queries.map((query, queryIndex) => {
      const text = requiredString(query, `news topic ${id} query ${queryIndex + 1}`);
      if (text.length > maxSearchQueryLength) {
        throw new Error(
          `News topic ${id} query ${queryIndex + 1} must not exceed ${maxSearchQueryLength} characters.`,
        );
      }
      return text;
    });

    return { id, label, enabled, sourcePolicy, maxItems, queries };
  });
  const totalQueries = topics.reduce((total, topic) => total + topic.queries.length, 0);
  if (totalQueries > newsTopicLimits.maxTotalQueries) {
    throw new Error(
      `News topic configuration supports at most ${newsTopicLimits.maxTotalQueries} queries.`,
    );
  }
  return topics;
}

function parseSourcePolicy(value: unknown, id: string): NewsSourcePolicy {
  if (value === "authoritative" || value === "official") return value;
  throw new Error(`News topic ${id} sourcePolicy must be authoritative or official.`);
}

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type {
  NewsQueryIntent,
  NewsSourcePolicy,
  NewsTopic,
  NewsTopicQuery,
} from "../domain/news.js";
import { optionalBoolean, requiredString, requirePositiveInteger } from "./config-parse.js";
import { requireRecord } from "./parsing.js";

const defaultTopicsFile = fileURLToPath(new URL("../../news-topics.json", import.meta.url));
const topicIdPattern = /^[a-z][a-z0-9-]*$/u;
const queryIdPattern = /^[a-z][a-z0-9-]*$/u;
const maxSearchQueryLength = 100;
const queryIntents = new Set<NewsQueryIntent>([
  "model-release",
  "developer-change",
  "service-incident",
  "security-advisory",
  "policy-action",
  "capital-event",
]);
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
  const queryIds = new Set<string>();
  const topics = parsed.map((item, index) => {
    const record = requireRecord(item, `news topic ${index + 1}`);
    const id = requiredString(record.id, `news topic ${index + 1} id`);
    if (!topicIdPattern.test(id)) throw new Error(`News topic id must use kebab-case: ${id}`);
    if (ids.has(id)) throw new Error(`Duplicate news topic id: ${id}`);
    ids.add(id);

    const label = requiredString(record.label, `news topic ${id} label`);
    const icon = requiredString(record.icon ?? "📰", `news topic ${id} icon`);
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
    const queries = record.queries.map((query, queryIndex) =>
      parseQuery(query, id, queryIndex, queryIds),
    );

    return { id, label, icon, enabled, sourcePolicy, maxItems, queries };
  });
  const totalQueries = topics.reduce((total, topic) => total + topic.queries.length, 0);
  if (totalQueries > newsTopicLimits.maxTotalQueries) {
    throw new Error(
      `News topic configuration supports at most ${newsTopicLimits.maxTotalQueries} queries.`,
    );
  }
  return topics;
}

function parseQuery(
  value: unknown,
  topicId: string,
  queryIndex: number,
  queryIds: Set<string>,
): NewsTopicQuery {
  const context = `news topic ${topicId} query ${queryIndex + 1}`;
  const record = requireRecord(value, context);
  const id = requiredString(record.id, `${context} id`);
  if (!queryIdPattern.test(id)) throw new Error(`News query id must use kebab-case: ${id}`);
  if (queryIds.has(id)) throw new Error(`Duplicate news query id: ${id}`);
  queryIds.add(id);
  const text = requiredString(record.text, `${context} text`);
  if (text.length > maxSearchQueryLength) {
    throw new Error(`${context} text must not exceed ${maxSearchQueryLength} characters.`);
  }
  const intent = parseQueryIntent(record.intent, id);
  return {
    id,
    text,
    intent,
    subjectAny: parseTerms(record.subjectAny, `${context} subjectAny`, true),
    eventAny: parseTerms(record.eventAny, `${context} eventAny`, true),
    excludedAny: parseTerms(record.excludedAny, `${context} excludedAny`, false),
  };
}

function parseQueryIntent(value: unknown, id: string): NewsQueryIntent {
  if (typeof value === "string" && queryIntents.has(value as NewsQueryIntent)) {
    return value as NewsQueryIntent;
  }
  throw new Error(`News query ${id} has an unsupported intent.`);
}

function parseTerms(value: unknown, context: string, required: boolean): string[] {
  if (!Array.isArray(value) || (required && value.length === 0)) {
    throw new Error(`${context} must be ${required ? "a non-empty" : "an"} array.`);
  }
  if (value.length > 20) throw new Error(`${context} supports at most 20 terms.`);
  return value.map((term, index) => requiredString(term, `${context} term ${index + 1}`));
}

function parseSourcePolicy(value: unknown, id: string): NewsSourcePolicy {
  if (value === "authoritative" || value === "official") return value;
  throw new Error(`News topic ${id} sourcePolicy must be authoritative or official.`);
}

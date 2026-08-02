import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { SignalFrontendBias, SignalQuotas, SignalScoring } from "../domain/signal.js";

export type SignalHackerNewsConfig = {
  minPoints: number;
  includeShowHn: boolean;
  maxItems: number;
};

export type SignalGithubSearchConfig = {
  createdWithinDays: number;
  minStars: number;
  languages: string[];
  topics: string[];
  excludeNamePatterns: RegExp[];
  perPage: number;
};

export type SignalOfficialSearchIntent = {
  kind: "model" | "product";
  query: string;
};

export type SignalOfficialSearchConfig = {
  domains: string[];
  intents: SignalOfficialSearchIntent[];
  countPerQuery: number;
};

export type SignalSourceConfig = {
  timezoneOffsetEnv: string;
  quotas: SignalQuotas;
  frontendBias: SignalFrontendBias;
  scoring: SignalScoring;
  hackerNews: SignalHackerNewsConfig;
  githubSearch: SignalGithubSearchConfig;
  officialSearch: SignalOfficialSearchConfig;
};

const defaultConfigFile = fileURLToPath(new URL("../../signal-sources.json", import.meta.url));

export function loadSignalSources(filePath = defaultConfigFile): SignalSourceConfig {
  return parseSignalSources(readFileSync(filePath, "utf8"));
}

export function parseSignalSources(value: string): SignalSourceConfig {
  const parsed = asRecord(JSON.parse(value), "signal source configuration");
  const quotas = parseQuotas(asRecord(parsed.quotas, "quotas"));
  const frontendBias = parseFrontendBias(asRecord(parsed.frontendBias, "frontendBias"));
  const scoring = parseScoring(asRecord(parsed.scoring, "scoring"));
  const hackerNews = parseHackerNews(asRecord(parsed.hackerNews, "hackerNews"));
  const githubSearch = parseGithubSearch(asRecord(parsed.githubSearch, "githubSearch"));
  const officialSearch = parseOfficialSearch(asRecord(parsed.officialSearch, "officialSearch"));
  if (officialSearch.intents.length > 0) {
    const modelCount = officialSearch.intents.filter(({ kind }) => kind === "model").length;
    const productCount = officialSearch.intents.filter(({ kind }) => kind === "product").length;
    if (modelCount === 0 || productCount === 0) {
      throw new Error(
        "officialSearch.intents must include at least one model and one product intent.",
      );
    }
  }
  return {
    timezoneOffsetEnv: optionalString(
      parsed.timezoneOffsetEnv,
      "FEED_TIMEZONE_OFFSET",
      "timezoneOffsetEnv",
    ),
    quotas,
    frontendBias,
    scoring,
    hackerNews,
    githubSearch,
    officialSearch,
  };
}

function parseQuotas(record: Record<string, unknown>): SignalQuotas {
  const maxTotal = boundedInteger(record.maxTotal, 8, 1, 16, "quotas.maxTotal");
  const updates = boundedInteger(record.updates, 5, 1, 12, "quotas.updates");
  const opensource = boundedInteger(record.opensource, 4, 1, 12, "quotas.opensource");
  if (updates > maxTotal || opensource > maxTotal) {
    throw new Error("quotas.updates and quotas.opensource must not exceed quotas.maxTotal.");
  }
  return { maxTotal, updates, opensource };
}

function parseFrontendBias(record: Record<string, unknown>): SignalFrontendBias {
  return {
    languages: stringList(record.languages, "frontendBias.languages"),
    repoTopics: stringList(record.repoTopics, "frontendBias.repoTopics"),
    updateKeywords: stringList(record.updateKeywords, "frontendBias.updateKeywords"),
    modelTitleHints: stringList(record.modelTitleHints, "frontendBias.modelTitleHints"),
  };
}

function parseScoring(record: Record<string, unknown>): SignalScoring {
  return {
    officialDomainBoost: boundedNumber(
      record.officialDomainBoost,
      30,
      0,
      500,
      "scoring.officialDomainBoost",
    ),
    hnPointsMaxScore: boundedNumber(
      record.hnPointsMaxScore,
      30,
      0,
      500,
      "scoring.hnPointsMaxScore",
    ),
    frontendKeywordBoost: boundedNumber(
      record.frontendKeywordBoost,
      8,
      0,
      100,
      "scoring.frontendKeywordBoost",
    ),
    frontendKeywordMaxHits: boundedInteger(
      record.frontendKeywordMaxHits,
      3,
      1,
      10,
      "scoring.frontendKeywordMaxHits",
    ),
    recencyMaxScore: boundedNumber(record.recencyMaxScore, 10, 0, 100, "scoring.recencyMaxScore"),
    crossSourceBoost: boundedNumber(
      record.crossSourceBoost,
      15,
      0,
      200,
      "scoring.crossSourceBoost",
    ),
    repoStarMaxScore: boundedNumber(
      record.repoStarMaxScore,
      50,
      0,
      500,
      "scoring.repoStarMaxScore",
    ),
    repoNewnessWeight: boundedNumber(
      record.repoNewnessWeight,
      2,
      0,
      100,
      "scoring.repoNewnessWeight",
    ),
    repoLanguageBoost: boundedNumber(
      record.repoLanguageBoost,
      10,
      0,
      100,
      "scoring.repoLanguageBoost",
    ),
    repoTopicBoost: boundedNumber(record.repoTopicBoost, 5, 0, 100, "scoring.repoTopicBoost"),
    repoTopicMaxHits: boundedInteger(record.repoTopicMaxHits, 3, 1, 10, "scoring.repoTopicMaxHits"),
    repoMissingDescriptionPenalty: boundedNumber(
      record.repoMissingDescriptionPenalty,
      10,
      0,
      200,
      "scoring.repoMissingDescriptionPenalty",
    ),
    repoMissingLanguagePenalty: boundedNumber(
      record.repoMissingLanguagePenalty,
      5,
      0,
      200,
      "scoring.repoMissingLanguagePenalty",
    ),
  };
}

function parseHackerNews(record: Record<string, unknown>): SignalHackerNewsConfig {
  return {
    minPoints: boundedInteger(record.minPoints, 80, 0, 10_000, "hackerNews.minPoints"),
    includeShowHn: optionalBoolean(record.includeShowHn, true, "hackerNews.includeShowHn"),
    maxItems: boundedInteger(record.maxItems, 20, 1, 100, "hackerNews.maxItems"),
  };
}

function parseGithubSearch(record: Record<string, unknown>): SignalGithubSearchConfig {
  return {
    createdWithinDays: boundedInteger(
      record.createdWithinDays,
      7,
      1,
      30,
      "githubSearch.createdWithinDays",
    ),
    minStars: boundedInteger(record.minStars, 50, 0, 1_000_000, "githubSearch.minStars"),
    languages: stringList(record.languages, "githubSearch.languages"),
    topics: stringList(record.topics, "githubSearch.topics"),
    excludeNamePatterns: stringList(
      record.excludeNamePatterns,
      "githubSearch.excludeNamePatterns",
    ).map((pattern, index) => {
      try {
        return new RegExp(pattern, "u");
      } catch {
        throw new Error(
          `githubSearch.excludeNamePatterns[${index}] is not a valid regular expression: ${pattern}`,
        );
      }
    }),
    perPage: boundedInteger(record.perPage, 8, 1, 50, "githubSearch.perPage"),
  };
}

function parseOfficialSearch(record: Record<string, unknown>): SignalOfficialSearchConfig {
  const intents =
    record.intents === undefined ? [] : asArray(record.intents, "officialSearch.intents");
  return {
    domains: stringList(record.domains, "officialSearch.domains"),
    intents: intents.map((item, index) => {
      const intent = asRecord(item, `officialSearch.intents[${index}]`);
      const kind = intent.kind;
      if (kind !== "model" && kind !== "product") {
        throw new Error(`officialSearch.intents[${index}] kind must be model or product.`);
      }
      return {
        kind,
        query: requiredString(intent.query, `officialSearch.intents[${index}] query`),
      };
    }),
    countPerQuery: boundedInteger(record.countPerQuery, 10, 1, 50, "officialSearch.countPerQuery"),
  };
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function stringList(value: unknown, label: string): string[] {
  const items = asArray(value, label);
  return items.map((item, index) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new Error(`${label}[${index}] must be a non-empty string.`);
    }
    return item.trim();
  });
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function optionalString(value: unknown, fallback: string, label: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function optionalBoolean(value: unknown, fallback: boolean, label: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
  return value;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  label: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  }
  return Number(value);
}

function boundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  label: string,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be a number between ${min} and ${max}.`);
  }
  return value;
}

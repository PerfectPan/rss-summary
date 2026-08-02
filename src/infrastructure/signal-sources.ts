import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { SignalFrontendBias, SignalQuotas, SignalScoring } from "../domain/signal.js";
import {
  optionalBoolean,
  optionalString,
  requireBoundedInteger,
  requireBoundedNumber,
  requiredString,
  requireArray,
  requireStringList,
} from "./config-parse.js";
import { requireRecord } from "./parsing.js";

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
  const parsed = requireRecord(JSON.parse(value), "signal source configuration");
  const quotas = parseQuotas(requireRecord(parsed.quotas, "quotas"));
  const frontendBias = parseFrontendBias(requireRecord(parsed.frontendBias, "frontendBias"));
  const scoring = parseScoring(requireRecord(parsed.scoring, "scoring"));
  const hackerNews = parseHackerNews(requireRecord(parsed.hackerNews, "hackerNews"));
  const githubSearch = parseGithubSearch(requireRecord(parsed.githubSearch, "githubSearch"));
  const officialSearch = parseOfficialSearch(
    requireRecord(parsed.officialSearch, "officialSearch"),
  );
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
  const maxTotal = requireBoundedInteger(record.maxTotal, 8, 1, 16, "quotas.maxTotal");
  const updates = requireBoundedInteger(record.updates, 5, 1, 12, "quotas.updates");
  const opensource = requireBoundedInteger(record.opensource, 4, 1, 12, "quotas.opensource");
  if (updates > maxTotal || opensource > maxTotal) {
    throw new Error("quotas.updates and quotas.opensource must not exceed quotas.maxTotal.");
  }
  return { maxTotal, updates, opensource };
}

function parseFrontendBias(record: Record<string, unknown>): SignalFrontendBias {
  return {
    languages: requireStringList(record.languages, "frontendBias.languages"),
    repoTopics: requireStringList(record.repoTopics, "frontendBias.repoTopics"),
    updateKeywords: requireStringList(record.updateKeywords, "frontendBias.updateKeywords"),
    modelTitleHints: requireStringList(record.modelTitleHints, "frontendBias.modelTitleHints"),
  };
}

function parseScoring(record: Record<string, unknown>): SignalScoring {
  return {
    officialDomainBoost: requireBoundedNumber(
      record.officialDomainBoost,
      30,
      0,
      500,
      "scoring.officialDomainBoost",
    ),
    hnPointsMaxScore: requireBoundedNumber(
      record.hnPointsMaxScore,
      30,
      0,
      500,
      "scoring.hnPointsMaxScore",
    ),
    frontendKeywordBoost: requireBoundedNumber(
      record.frontendKeywordBoost,
      8,
      0,
      100,
      "scoring.frontendKeywordBoost",
    ),
    frontendKeywordMaxHits: requireBoundedInteger(
      record.frontendKeywordMaxHits,
      3,
      1,
      10,
      "scoring.frontendKeywordMaxHits",
    ),
    recencyMaxScore: requireBoundedNumber(
      record.recencyMaxScore,
      10,
      0,
      100,
      "scoring.recencyMaxScore",
    ),
    crossSourceBoost: requireBoundedNumber(
      record.crossSourceBoost,
      15,
      0,
      200,
      "scoring.crossSourceBoost",
    ),
    repoStarMaxScore: requireBoundedNumber(
      record.repoStarMaxScore,
      50,
      0,
      500,
      "scoring.repoStarMaxScore",
    ),
    repoNewnessWeight: requireBoundedNumber(
      record.repoNewnessWeight,
      2,
      0,
      100,
      "scoring.repoNewnessWeight",
    ),
    repoLanguageBoost: requireBoundedNumber(
      record.repoLanguageBoost,
      10,
      0,
      100,
      "scoring.repoLanguageBoost",
    ),
    repoTopicBoost: requireBoundedNumber(
      record.repoTopicBoost,
      5,
      0,
      100,
      "scoring.repoTopicBoost",
    ),
    repoTopicMaxHits: requireBoundedInteger(
      record.repoTopicMaxHits,
      3,
      1,
      10,
      "scoring.repoTopicMaxHits",
    ),
    repoMissingDescriptionPenalty: requireBoundedNumber(
      record.repoMissingDescriptionPenalty,
      10,
      0,
      200,
      "scoring.repoMissingDescriptionPenalty",
    ),
    repoMissingLanguagePenalty: requireBoundedNumber(
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
    minPoints: requireBoundedInteger(record.minPoints, 80, 0, 10_000, "hackerNews.minPoints"),
    includeShowHn: optionalBoolean(record.includeShowHn, true, "hackerNews.includeShowHn"),
    maxItems: requireBoundedInteger(record.maxItems, 20, 1, 100, "hackerNews.maxItems"),
  };
}

function parseGithubSearch(record: Record<string, unknown>): SignalGithubSearchConfig {
  return {
    createdWithinDays: requireBoundedInteger(
      record.createdWithinDays,
      7,
      1,
      30,
      "githubSearch.createdWithinDays",
    ),
    minStars: requireBoundedInteger(record.minStars, 50, 0, 1_000_000, "githubSearch.minStars"),
    languages: requireStringList(record.languages, "githubSearch.languages"),
    topics: requireStringList(record.topics, "githubSearch.topics"),
    excludeNamePatterns: requireStringList(
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
    perPage: requireBoundedInteger(record.perPage, 8, 1, 50, "githubSearch.perPage"),
  };
}

function parseOfficialSearch(record: Record<string, unknown>): SignalOfficialSearchConfig {
  const intents =
    record.intents === undefined ? [] : requireArray(record.intents, "officialSearch.intents");
  return {
    domains: requireStringList(record.domains, "officialSearch.domains"),
    intents: intents.map((item, index) => {
      const intent = requireRecord(item, `officialSearch.intents[${index}]`);
      const kind = intent.kind;
      if (kind !== "model" && kind !== "product") {
        throw new Error(`officialSearch.intents[${index}] kind must be model or product.`);
      }
      return {
        kind,
        query: requiredString(intent.query, `officialSearch.intents[${index}] query`),
      };
    }),
    countPerQuery: requireBoundedInteger(
      record.countPerQuery,
      10,
      1,
      50,
      "officialSearch.countPerQuery",
    ),
  };
}

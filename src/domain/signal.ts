import { shiftCalendarDay, startOfCalendarDay } from "./time.js";
import { canonicalizeUrl, compactSummary, formatCompactCount, isSameTitleEvent, parsePublishTime } from "./text.js";

export type SignalKind = "model" | "product" | "repo" | "release";
export type SignalSection = "updates" | "opensource";

export type SignalQuotas = {
  maxTotal: number;
  updates: number;
  opensource: number;
};

export type SignalFrontendBias = {
  languages: string[];
  repoTopics: string[];
  updateKeywords: string[];
  modelTitleHints: string[];
};

export type SignalScoring = {
  officialDomainBoost: number;
  hnPointsMaxScore: number;
  frontendKeywordBoost: number;
  frontendKeywordMaxHits: number;
  recencyMaxScore: number;
  crossSourceBoost: number;
  repoStarMaxScore: number;
  repoNewnessWeight: number;
  repoLanguageBoost: number;
  repoTopicBoost: number;
  repoTopicMaxHits: number;
  repoMissingDescriptionPenalty: number;
  repoMissingLanguagePenalty: number;
};

export type SignalItem = {
  id: string;
  kind: SignalKind;
  section: SignalSection;
  title: string;
  url: string;
  summary: string;
  sourceLabel: string;
  publishedAt?: string;
  metrics?: {
    stars?: number;
    points?: number;
    createdAt?: string;
    language?: string;
  };
  score: number;
  reasons: string[];
};

export type SignalUpdateHit = {
  id: string;
  title: string;
  url: string;
  summary?: string;
  publishedAt?: string;
  sourceLabel: string;
  kind: "model" | "product";
  source: "official" | "hn";
  points?: number;
};

export type SignalRepoHit = {
  id: string;
  title: string;
  url: string;
  description?: string;
  language?: string;
  stars: number;
  createdAt: string;
  topics: string[];
  sourceLabel: string;
};

export type SignalTimeWindow = {
  day: string;
  since: number;
  until: number;
  timezoneOffset: string;
};

export type SignalDomainRules = {
  window: SignalTimeWindow;
  scoring: SignalScoring;
  frontendBias: SignalFrontendBias;
  officialDomains: string[];
  excludeNamePatterns: RegExp[];
  createdWithinDays: number;
};

export function classifyUpdateKind(title: string, hints: string[]): "model" | "product" {
  const normalized = title.normalize("NFKC").toLowerCase();
  return hints.some((hint) => normalized.includes(hint.normalize("NFKC").toLowerCase())) ? "model" : "product";
}

export function buildSignalUpdates(hits: SignalUpdateHit[], rules: SignalDomainRules): SignalItem[] {
  const groups = new Map<string, SignalUpdateHit[]>();
  for (const hit of hits) {
    if (!isAcceptedUpdateHit(hit, rules)) continue;
    const canonicalUrl = canonicalizeUrl(hit.url);
    if (!canonicalUrl) continue;
    const current = groups.get(canonicalUrl) ?? [];
    current.push(hit);
    groups.set(canonicalUrl, current);
  }

  const items = [...groups.entries()]
    .map(([canonicalUrl, matches]) => toUpdateItem(canonicalUrl, matches, rules))
    .sort((left, right) => right.score - left.score);
  return collapseSameEvents(items);
}

export function buildSignalRepos(hits: SignalRepoHit[], rules: SignalDomainRules): SignalItem[] {
  const byIdentity = new Map<string, SignalRepoHit>();
  for (const hit of hits) {
    if (!isAcceptedRepoHit(hit, rules)) continue;
    const identity = hit.id.toLowerCase();
    const existing = byIdentity.get(identity);
    if (!existing || hit.stars > existing.stars) byIdentity.set(identity, hit);
  }
  return [...byIdentity.values()]
    .map((hit) => toRepoItem(hit, rules))
    .sort((left, right) => right.score - left.score);
}

export function selectSignalItems(
  updates: SignalItem[],
  repos: SignalItem[],
  quotas: SignalQuotas,
): { updates: SignalItem[]; opensource: SignalItem[] } {
  // Section-cap first (soft balance for updates), then shrink budgets to fit maxTotal
  // and re-run soft balance so a global re-sort cannot wipe a soft-balanced kind.
  const sectionUpdates = selectWithSoftBalance(updates, quotas.updates);
  const sectionRepos = repos.slice(0, quotas.opensource);
  let updatesCap = sectionUpdates.length;
  let opensourceCap = sectionRepos.length;
  while (updatesCap + opensourceCap > quotas.maxTotal) {
    if (updatesCap >= opensourceCap && updatesCap > 0) updatesCap -= 1;
    else if (opensourceCap > 0) opensourceCap -= 1;
    else break;
  }
  return {
    updates: selectWithSoftBalance(updates, updatesCap),
    opensource: repos.slice(0, opensourceCap),
  };
}

/** Count update hits that fail the time-window filter (including missing publish time). */
export function countOutOfWindowUpdateHits(hits: SignalUpdateHit[], rules: SignalDomainRules): number {
  return hits.filter((hit) => hit.title.trim() && hit.url.trim() && !isWithinUpdateWindow(hit, rules)).length;
}

function isAcceptedUpdateHit(hit: SignalUpdateHit, rules: SignalDomainRules): boolean {
  if (!hit.title.trim() || !hit.url.trim()) return false;
  if (hit.source === "official" && !isOfficialDomain(hit.url, rules.officialDomains)) return false;
  return isWithinUpdateWindow(hit, rules);
}

function isWithinUpdateWindow(hit: SignalUpdateHit, rules: SignalDomainRules): boolean {
  const publishedAt = hit.publishedAt
    ? parsePublishTime(hit.publishedAt, rules.window.timezoneOffset)
    : Number.NaN;
  return Number.isFinite(publishedAt) && publishedAt >= rules.window.since && publishedAt < rules.window.until;
}

function isAcceptedRepoHit(hit: SignalRepoHit, rules: SignalDomainRules): boolean {
  const name = hit.title.split("/").pop() ?? "";
  if (rules.excludeNamePatterns.some((pattern) => pattern.test(name))) return false;
  const createdAt = Date.parse(hit.createdAt);
  if (!Number.isFinite(createdAt)) return false;
  const createdSince = startOfCalendarDay(
    shiftCalendarDay(rules.window.day, -(rules.createdWithinDays - 1)),
    rules.window.timezoneOffset,
  );
  return createdAt >= createdSince && createdAt < rules.window.until;
}

function toUpdateItem(canonicalUrl: string, matches: SignalUpdateHit[], rules: SignalDomainRules): SignalItem {
  // Prefer official hit for kind/title/summary/sourceLabel so dual-source does not flip labels to HN.
  // Still take the best HN points (if any) for scoring.
  const content = pickContentHit(matches);
  const points = maxPoints(matches);
  const publishedAt = content.publishedAt ?? "";
  const scoreParts: Array<{ label: string; value: number }> = [];
  const reasons: string[] = [];

  const official = isOfficialDomain(canonicalUrl, rules.officialDomains);
  if (official) {
    scoreParts.push({ label: "官方来源", value: rules.scoring.officialDomainBoost });
    reasons.push("官方来源");
  }

  if (points !== undefined) {
    const pointsScore = Math.min(Math.sqrt(points), rules.scoring.hnPointsMaxScore);
    scoreParts.push({ label: `HN ${points} 分`, value: pointsScore });
    reasons.push(`HN ${points} 分`);
  }

  const keywordMatches = matchedKeywords(
    `${content.title} ${content.summary ?? ""}`,
    rules.frontendBias.updateKeywords,
    rules.scoring.frontendKeywordMaxHits,
  );
  if (keywordMatches.length > 0) {
    const keywordScore = keywordMatches.length * rules.scoring.frontendKeywordBoost;
    scoreParts.push({ label: `关键词 ${keywordMatches.join("/")}`, value: keywordScore });
    reasons.push(`关键词 ${keywordMatches.join("/")}`);
  }

  const recency = recencyScore(publishedAt, rules);
  if (recency > 0) {
    scoreParts.push({ label: "时效", value: recency });
    reasons.push("时效");
  }

  const crossSource =
    matches.some(({ source }) => source === "official") && matches.some(({ source }) => source === "hn");
  if (crossSource) {
    scoreParts.push({ label: "双源命中", value: rules.scoring.crossSourceBoost });
    reasons.push("双源命中");
  }

  return {
    id: content.id,
    kind: content.kind,
    section: "updates",
    title: content.title.trim(),
    url: canonicalUrl,
    summary: compactSummary(content.summary ?? "暂无可用摘要。", content.title),
    sourceLabel: content.sourceLabel,
    publishedAt,
    metrics: points !== undefined ? { points } : undefined,
    score: Math.round(scoreParts.reduce((total, part) => total + part.value, 0) * 10) / 10,
    reasons,
  };
}

function pickContentHit(matches: SignalUpdateHit[]): SignalUpdateHit {
  const official = matches
    .filter(({ source }) => source === "official")
    .sort((left, right) => left.id.localeCompare(right.id))[0];
  if (official) return official;
  return [...matches].sort(
    (left, right) => (right.points ?? 0) - (left.points ?? 0) || left.id.localeCompare(right.id),
  )[0]!;
}

function maxPoints(matches: SignalUpdateHit[]): number | undefined {
  let best: number | undefined;
  for (const hit of matches) {
    if (hit.points === undefined) continue;
    if (best === undefined || hit.points > best) best = hit.points;
  }
  return best;
}

function toRepoItem(hit: SignalRepoHit, rules: SignalDomainRules): SignalItem {
  const scoreParts: Array<{ label: string; value: number }> = [];
  const reasons: string[] = [];

  const starScore = Math.min(Math.sqrt(hit.stars), rules.scoring.repoStarMaxScore);
  scoreParts.push({ label: `${hit.stars}★`, value: starScore });
  reasons.push(`${formatCompactCount(hit.stars)} 星`);

  const ageDays = Math.max(0, Math.floor((rules.window.until - Date.parse(hit.createdAt)) / 86_400_000));
  const newness = Math.max(0, rules.createdWithinDays - ageDays) * rules.scoring.repoNewnessWeight;
  if (newness > 0) {
    scoreParts.push({ label: `新增 ${new Date(hit.createdAt).toISOString().slice(0, 10)}`, value: newness });
    reasons.push(`${ageDays} 天前创建`);
  }

  const languageMatch =
    hit.language &&
    rules.frontendBias.languages.some((language) => language.toLowerCase() === hit.language!.toLowerCase());
  if (languageMatch) {
    scoreParts.push({ label: `语言 ${hit.language}`, value: rules.scoring.repoLanguageBoost });
    reasons.push(`语言 ${hit.language}`);
  }

  const topicMatches = matchedKeywords(
    hit.topics.join(" "),
    rules.frontendBias.repoTopics,
    rules.scoring.repoTopicMaxHits,
  );
  if (topicMatches.length > 0) {
    const topicScore = topicMatches.length * rules.scoring.repoTopicBoost;
    scoreParts.push({ label: `话题 ${topicMatches.join("/")}`, value: topicScore });
    reasons.push(`话题 ${topicMatches.join("/")}`);
  }

  const keywordMatches = matchedKeywords(
    hit.description ?? "",
    rules.frontendBias.updateKeywords,
    rules.scoring.frontendKeywordMaxHits,
  );
  if (keywordMatches.length > 0) {
    const keywordScore = keywordMatches.length * rules.scoring.frontendKeywordBoost;
    scoreParts.push({ label: `关键词 ${keywordMatches.join("/")}`, value: keywordScore });
    reasons.push(`关键词 ${keywordMatches.join("/")}`);
  }

  if (!hit.description) {
    scoreParts.push({ label: "无描述", value: -rules.scoring.repoMissingDescriptionPenalty });
    reasons.push("无描述");
  }
  if (!hit.language) {
    scoreParts.push({ label: "无语言", value: -rules.scoring.repoMissingLanguagePenalty });
    reasons.push("无语言");
  }

  return {
    id: hit.id,
    kind: "repo",
    section: "opensource",
    title: hit.title,
    url: hit.url,
    summary: hit.description ?? "暂无可用摘要。",
    sourceLabel: hit.sourceLabel,
    publishedAt: hit.createdAt,
    metrics: { stars: hit.stars, createdAt: hit.createdAt, language: hit.language },
    score: Math.round(scoreParts.reduce((total, part) => total + part.value, 0) * 10) / 10,
    reasons,
  };
}

function selectWithSoftBalance(items: SignalItem[], cap: number): SignalItem[] {
  const byKind = new Map<string, SignalItem[]>();
  for (const item of items) {
    const current = byKind.get(item.kind) ?? [];
    current.push(item);
    byKind.set(item.kind, current);
  }
  for (const kindItems of byKind.values()) kindItems.sort((left, right) => right.score - left.score);

  const selected: SignalItem[] = [];
  while (selected.length < cap) {
    const kinds = [...byKind.keys()].filter((kind) => (byKind.get(kind)?.length ?? 0) > 0);
    if (kinds.length === 0) break;
    const counts = new Map(kinds.map((kind) => [kind, selected.filter((item) => item.kind === kind).length]));
    const minimum = Math.min(...counts.values());
    const candidates = kinds
      .filter((kind) => counts.get(kind)! === minimum)
      .map((kind) => ({ kind, score: byKind.get(kind)![0]!.score }));
    candidates.sort((left, right) => right.score - left.score || left.kind.localeCompare(right.kind));
    const chosen = candidates[0]!;
    selected.push(byKind.get(chosen.kind)!.shift()!);
  }
  return selected;
}

function collapseSameEvents(items: SignalItem[]): SignalItem[] {
  const collapsed: SignalItem[] = [];
  for (const item of items) {
    if (collapsed.some((candidate) => isSameTitleEvent(candidate, item))) continue;
    collapsed.push(item);
  }
  return collapsed;
}

function matchedKeywords(value: string, keywords: string[], cap: number): string[] {
  const normalized = value.normalize("NFKC").toLowerCase();
  const matches: string[] = [];
  for (const keyword of keywords) {
    if (matches.length >= cap) break;
    if (normalized.includes(keyword.normalize("NFKC").toLowerCase())) matches.push(keyword);
  }
  return matches;
}

function isOfficialDomain(url: string, domains: string[]): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return domains.some((domain) => {
    const normalized = domain.toLowerCase();
    return hostname === normalized || hostname.endsWith(`.${normalized}`);
  });
}

function recencyScore(publishedAt: string, rules: SignalDomainRules): number {
  const instant = Date.parse(publishedAt);
  if (!Number.isFinite(instant)) return 0;
  const span = rules.window.until - rules.window.since;
  if (span <= 0) return 0;
  // Prefer newer items within the window: score approaches recencyMaxScore near `until`.
  return ((instant - rules.window.since) / span) * rules.scoring.recencyMaxScore;
}

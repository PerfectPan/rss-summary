import type { NewsCredibility, NewsSearchHit, NewsSourcePolicy } from "../value-objects/news.js";

export function projectNewsHit(
  result: {
    id: string;
    title: string;
    siteName?: string;
    url: string;
    snippet?: string;
    summary?: string;
    publishTime?: string;
    publishDay?: NewsSearchHit["publishDay"];
    rankScore?: number;
    authInfoDescription?: string;
    rankPosition: number;
  },
  binding: {
    topicId: string;
    topicLabel: string;
    sourcePolicy: NewsSourcePolicy;
    queryId: string;
    queryText: string;
    subjectAny: readonly string[];
    eventAny: readonly string[];
    excludedAny: readonly string[];
  },
  credibility: NewsCredibility,
): NewsSearchHit {
  return {
    id: result.id,
    title: result.title,
    ...(result.siteName !== undefined ? { siteName: result.siteName } : {}),
    url: result.url,
    ...(result.snippet !== undefined ? { snippet: result.snippet } : {}),
    ...(result.summary !== undefined ? { summary: result.summary } : {}),
    ...(result.publishTime !== undefined ? { publishTime: result.publishTime } : {}),
    ...(result.publishDay !== undefined ? { publishDay: result.publishDay } : {}),
    ...(result.rankScore !== undefined ? { rankScore: result.rankScore } : {}),
    ...(result.authInfoDescription !== undefined
      ? { authInfoDescription: result.authInfoDescription }
      : {}),
    credibility: {
      tier: credibility.tier,
      ...(credibility.method ? { method: credibility.method } : {}),
    },
    authorityRank: credibility.rank,
    topicId: binding.topicId,
    topicLabel: binding.topicLabel,
    sourcePolicy: binding.sourcePolicy,
    queryId: binding.queryId,
    queryText: binding.queryText,
    subjectAny: [...binding.subjectAny],
    eventAny: [...binding.eventAny],
    excludedAny: [...binding.excludedAny],
    rankPosition: result.rankPosition,
  };
}

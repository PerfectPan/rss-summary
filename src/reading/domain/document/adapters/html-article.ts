import { load } from "cheerio";

const DEFAULT_MAX_CHARS = 16_000;

export function extractArticle(
  body: string,
  url: string,
  maxChars = DEFAULT_MAX_CHARS,
): { content: string; title: string } {
  const $ = load(body);
  const title = cleanText(
    $("meta[property='og:title']").attr("content") ||
      $("h1").first().text() ||
      $("title").first().text() ||
      new URL(url).hostname,
  );
  // Clean the whole document because pages without an article root use its text as fallback.
  $(
    "script,style,noscript,template,svg,nav,footer,header,aside,form,button,iframe,video,audio",
  ).remove();
  const root = selectContentRoot($);
  const lines = root
    .find("h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,td,th")
    .map((_index, element) => cleanText($(element).text()))
    .get()
    .filter((line): line is string => Boolean(line))
    .filter((line) => !isResearchBoilerplate(line));
  const structured = compactLines(lines).slice(0, maxChars).trim();
  const content = (structured || cleanText($.root().text())).slice(0, maxChars).trim();
  return { content, title };
}

function selectContentRoot($: ReturnType<typeof load>) {
  const candidates = $(
    "article,[itemprop='articleBody'],[data-pagefind-body],.markdown-body,.prose,main",
  );
  let best = candidates.first();
  let bestScore = Number.NEGATIVE_INFINITY;
  candidates.each((_index, element) => {
    const current = $(element);
    const textLength = current.text().replace(/\s+/gu, " ").trim().length;
    const headingCount = current.find("h1,h2,h3,h4,h5,h6").length;
    const paragraphCount = current.find("p").length;
    const listItemCount = current.find("li").length;
    const score = textLength + headingCount * 500 + paragraphCount * 100 - listItemCount * 30;
    if (score > bestScore) {
      best = current;
      bestScore = score;
    }
  });
  return best;
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/gu, " ").trim();
}

function isResearchBoilerplate(line: string): boolean {
  return (
    /^"?\s*AI资讯\s*\|\s*每日早读/u.test(line) ||
    line === "AI资讯日报多渠道" ||
    /^(?:💬\s*|📹\s*)?(?:微信公众号|抖音)$/u.test(line) ||
    /^(?:公众号|自媒体账号)[:：]?/u.test(line)
  );
}

function compactLines(lines: string[]): string {
  const seen = new Set<string>();
  return lines
    .filter((line) => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    })
    .join("\n");
}

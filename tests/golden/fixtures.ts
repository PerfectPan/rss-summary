/** Fixed clock for every golden scenario. Noon occurrence in +08:00. */
export const FROZEN_NOW = "2026-08-16T04:00:00.000Z";
export const WINDOW_SINCE = "2026-08-15T00:00:00+08:00";
export const WINDOW_UNTIL = "2026-08-16T00:00:00+08:00";

export const PERSONAL_FEED_URL = "https://example.com/feed.xml";
export const BROKEN_FEED_URL = "https://example.com/broken.xml";
export const INDUSTRY_FEED_URL = "https://example.com/industry.xml";
export const ARTICLE_URL = "https://example.com/deno-2-4";
export const INDUSTRY_ARTICLE_URL = "https://example.com/industry-note";
export const INDUSTRY_PAGE_URL = "https://www.anthropic.com/news";
export const DOUBAO_URL = "https://open.feedcoopapi.com/search_api/web_search";

export const PERSONAL_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <item>
      <title>TypeScript toolchain update</title>
      <link>${ARTICLE_URL}</link>
      <guid>${ARTICLE_URL}</guid>
      <pubDate>Sat, 15 Aug 2026 02:00:00 GMT</pubDate>
      <description>The TypeScript toolchain update documents a concrete workflow change for agents.</description>
    </item>
  </channel>
</rss>
`;

export const INDUSTRY_ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Industry</title>
  <entry>
    <title>TypeScript industry note</title>
    <link href="${INDUSTRY_ARTICLE_URL}"/>
    <id>${INDUSTRY_ARTICLE_URL}</id>
    <published>2026-08-15T06:00:00Z</published>
    <summary>A documented TypeScript change published on the industry feed.</summary>
  </entry>
</feed>
`;

export const INDUSTRY_PAGE_HTML = `<!doctype html>
<html>
  <body>
    <article>
      <a href="/news/claude-tools">
        <h2>Claude tools update</h2>
        <time datetime="2026-08-15T06:00:00Z">2026-08-15</time>
        <p>Anthropic published a TypeScript tooling change for Claude with a documented workflow update.</p>
      </a>
    </article>
  </body>
</html>
`;

export const ARTICLE_HTML = `<!doctype html>
<html>
  <head><title>TypeScript toolchain update</title></head>
  <body>
    <article>
      <h1>TypeScript toolchain update</h1>
      <p>The TypeScript toolchain update documents a concrete workflow change for agents and explains how the new compiler flags affect an existing project.</p>
    </article>
  </body>
</html>
`;

export const PERSONAL_FEEDS = [
  { name: "Example Feed", url: PERSONAL_FEED_URL, tags: ["typescript"] },
];

export const INDUSTRY_SOURCES = [
  { name: "Industry Feed", url: INDUSTRY_FEED_URL, tags: ["typescript"] },
  {
    type: "page",
    name: "Anthropic News",
    url: INDUSTRY_PAGE_URL,
    pathPrefixes: ["/news/"],
    tags: ["News"],
  },
];

export const NEWS_TOPICS = [
  {
    id: "ai-model-releases",
    label: "AI 模型与 Agent 发布",
    icon: "🤖",
    enabled: true,
    sourcePolicy: "news",
    maxItems: 2,
    queries: [
      {
        id: "frontier-model-release",
        text: "OpenAI 正式发布新模型",
        intent: "model-release",
        subjectAny: ["OpenAI"],
        eventAny: ["正式发布"],
        excludedAny: ["传闻"],
      },
    ],
  },
];

export const GITHUB_WATCH_EVENT = {
  id: "1001",
  type: "WatchEvent",
  actor: { login: "alice" },
  repo: { name: "example/project" },
  created_at: "2026-08-15T02:00:00Z",
  payload: { action: "started" },
};

export const GITHUB_REPOSITORY = {
  full_name: "example/project",
  html_url: "https://github.com/example/project",
  description: "A TypeScript project.",
  language: "TypeScript",
  stargazers_count: 12345,
  topics: ["typescript"],
  pushed_at: "2026-08-15T00:00:00Z",
};

export function snowflake(iso: string): string {
  return ((BigInt(Date.parse(iso)) - 1288834974657n) << 22n).toString();
}

export function grokStream(post: {
  author: string;
  publishedAt: string;
  summary: string;
  title: string;
}): string {
  const handle = post.author.replace(/^@/u, "");
  const id = snowflake(post.publishedAt);
  const events = [
    { type: "text", data: "I will search X." },
    {
      type: "tool_call",
      toolCallId: "native",
      rawInput: { variant: "XSearch", backend: true },
    },
    {
      type: "tool_call_update",
      toolCallId: "native",
      status: "completed",
      rawOutput: { name: "x_keyword_search" },
    },
    {
      type: "text",
      data: JSON.stringify({
        posts: [
          {
            url: `https://x.com/${handle}/status/${id}`,
            author: post.author.startsWith("@") ? post.author : `@${post.author}`,
            title: post.title,
            summary: post.summary,
            publishedAt: post.publishedAt,
          },
        ],
      }),
    },
    {
      type: "end",
      stopReason: "end_turn",
      usage: {
        total_tokens: 200,
        input_tokens: 80,
        cache_read_input_tokens: 100,
        output_tokens: 20,
      },
      total_cost_usd: 0.001,
    },
  ];
  return events.map((event) => JSON.stringify(event)).join("\n") + "\n";
}

export function doubaoPayload(publishTime: string): string {
  return JSON.stringify({
    ResponseMetadata: {},
    Result: {
      LogId: "log-golden",
      ResultCount: 1,
      TimeCost: 12,
      WebResults: [
        {
          Id: "doubao-golden",
          Title: "OpenAI 正式发布新模型",
          Url: "https://openai.com/news/new-model",
          SiteName: "OpenAI",
          Summary: "OpenAI 正式发布新模型，并开放 API。",
          PublishTime: publishTime,
          RankScore: 0.9,
          SortId: 1,
          AuthInfoDes: "官方站点",
          AuthInfoLevel: 1,
        },
      ],
    },
  });
}

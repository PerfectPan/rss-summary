type Options = {
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export type ResearchSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type ResearchPage = {
  title: string;
  url: string;
  content: string;
  truncated: boolean;
  publishedAt?: string;
};

const endpoints = {
  search: "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
  read: "https://open.bigmodel.cn/api/mcp/web_reader/mcp",
};

export class GlmResearchClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly apiKey: string;

  constructor(options: Options) {
    if (!options.apiKey.trim()) throw new Error("GLM_CODING_API_KEY is required.");
    this.apiKey = options.apiKey.trim();
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async search(
    query: string,
    domains: string[],
    recency: "noLimit" | "oneDay" | "oneWeek" = "noLimit",
    observe?: (counts: { rawResults: number; domainRejected: number }) => void,
    location: "cn" | "us" = "cn",
  ): Promise<ResearchSearchResult[]> {
    if (!query.trim() || query.length > 70)
      throw new Error("Search query must contain 1 to 70 characters.");
    if (!domains.length) throw new Error("At least one source domain is required.");
    const allowed = domains.map((domain) => {
      const url = publicUrl(`https://${domain}`);
      if (url.host !== domain.toLowerCase() || url.pathname !== "/" || url.search || url.hash) {
        throw new Error("Source domains must be hostnames without paths or ports.");
      }
      return url.hostname;
    });
    const value = await this.call("search", "web_search_prime", {
      search_query: query.trim(),
      location,
      ...(allowed.length === 1 ? { search_domain_filter: allowed[0] } : {}),
      content_size: "medium",
      search_recency_filter: recency,
    });
    if (!Array.isArray(value)) throw new Error("GLM search returned an invalid result list.");
    const results: ResearchSearchResult[] = [];
    let domainRejected = 0;
    const seen = new Set<string>();
    for (const item of value) {
      const record = asRecord(item);
      if (
        typeof record.title !== "string" ||
        typeof record.link !== "string" ||
        !record.title.trim()
      )
        continue;
      let url: URL;
      try {
        url = publicUrl(record.link);
      } catch {
        continue;
      }
      if (
        !allowed.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))
      ) {
        domainRejected++;
        continue;
      }
      if (seen.has(url.href)) continue;
      seen.add(url.href);
      results.push({
        title: record.title.slice(0, 500),
        url: url.href,
        snippet: text(record.content).slice(0, 3000),
      });
      if (results.length === 10) break;
    }
    observe?.({ rawResults: value.length, domainRejected });
    return results;
  }

  async read(input: string): Promise<ResearchPage> {
    const url = publicUrl(input);
    const value = asRecord(
      await this.call("read", "webReader", {
        url: url.href,
        return_format: "text",
        retain_images: false,
        timeout: Math.max(1, Math.min(20, Math.floor(this.timeoutMs / 1000))),
      }),
    );
    const content = text(value.content);
    if (!content.trim()) throw new Error("GLM Reader returned no readable content.");
    const resolved = typeof value.url === "string" ? publicUrl(value.url) : url;
    // A changed origin requires an explicit read so a redirect cannot silently replace the selected source.
    if (resolved.origin !== url.origin)
      throw new Error("GLM Reader returned a different source origin.");
    return {
      title: text(value.title).slice(0, 500),
      url: resolved.href,
      content: content.slice(0, 16_000),
      truncated: content.length > 16_000,
      ...publicationTime(value.metadata),
    };
  }

  private async call(
    service: keyof typeof endpoints,
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    const request = async (
      method: string,
      params?: unknown,
      id?: number,
    ): Promise<Record<string, unknown>> => {
      let response: Response;
      try {
        response = await this.fetchImpl(endpoints[service], {
          method: "POST",
          headers,
          redirect: "error",
          signal,
          body: JSON.stringify({
            jsonrpc: "2.0",
            ...(id === undefined ? {} : { id }),
            method,
            ...(params === undefined ? {} : { params }),
          }),
        });
      } catch {
        throw new Error(
          signal.aborted ? "GLM MCP request timed out." : "GLM MCP connection failed.",
        );
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`GLM MCP HTTP ${response.status}.`);
      }
      const session = response.headers.get("mcp-session-id");
      if (session) headers["Mcp-Session-Id"] = session;
      if (id === undefined) {
        await response.body?.cancel();
        return {};
      }
      const message = await readMessage(response, id);
      if (message.error) throw new Error("GLM MCP rejected the request.");
      return asRecord(message.result);
    };
    const initialized = await request(
      "initialize",
      {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "rss-summary", version: "0.1.0" },
      },
      1,
    );
    if (initialized.protocolVersion !== "2024-11-05")
      throw new Error("Unsupported GLM MCP protocol version.");
    headers["MCP-Protocol-Version"] = "2024-11-05";
    await request("notifications/initialized");
    const result = await request("tools/call", { name, arguments: args }, 2);
    if (result.isError) throw new Error(`GLM ${service} tool failed.`);
    const blocks = Array.isArray(result.content) ? result.content : [];
    const block = blocks
      .map(asRecord)
      .find((item) => item.type === "text" && typeof item.text === "string");
    if (!block) throw new Error("GLM MCP returned no text result.");
    // These endpoints currently wrap the payload in multiple JSON strings.
    let value: unknown = block.text;
    try {
      for (let depth = 0; depth < 4 && typeof value === "string"; depth++)
        value = JSON.parse(value);
    } catch {
      throw new Error("GLM MCP returned invalid tool JSON.");
    }
    return value;
  }
}

async function readMessage(response: Response, id: number): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("GLM MCP returned an empty response.");
  const decoder = new TextDecoder();
  const sse = response.headers.get("content-type")?.includes("text/event-stream");
  let buffer = "";
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      bytes += chunk.value?.byteLength ?? 0;
      if (bytes > 2_000_000) throw new Error("GLM MCP response exceeded the size limit.");
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      if (sse) {
        let boundary: RegExpExecArray | null;
        while ((boundary = /\r?\n\r?\n/u.exec(buffer))) {
          const event = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary[0].length);
          const data = event
            .split(/\r?\n/u)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (!data) continue;
          const message = asRecord(JSON.parse(data));
          if (message.id === id) return message;
        }
      }
      if (chunk.done) break;
    }
    if (!sse) {
      const message = asRecord(JSON.parse(buffer));
      if (message.id === id) return message;
    }
    throw new Error("missing response");
  } catch {
    throw new Error(
      "GLM MCP response could not be read within the size/time limits or was invalid.",
    );
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function publicUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("A public HTTP(S) URL is required.");
  }
  const host = url.hostname;
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !host.includes(".") ||
    host.includes(":") ||
    /^[\d.]+$/u.test(host) ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/iu.test(host)
  ) {
    throw new Error("A public HTTP(S) URL without credentials or a custom port is required.");
  }
  return url;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function publicationTime(metadata: unknown): { publishedAt?: string } {
  const record = asRecord(metadata);
  // Keep date-only precision. The consumer decides whether the entire day fits its window.
  const values = [record["article:published_time"], record.datePublished, record["datepublished"]]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim());
  if (values.length && values.every((value) => /^\d{4}-\d{2}-\d{2}$/u.test(value))) {
    const day = new Date(`${values[0]}T00:00:00Z`);
    if (
      new Set(values).size === 1 &&
      Number.isFinite(day.getTime()) &&
      day.toISOString().slice(0, 10) === values[0]
    )
      return { publishedAt: values[0] };
    return {};
  }
  const times = values.map((value) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value))
      return Number.NaN;
    const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    if (
      !Number.isFinite(day.getTime()) ||
      day.toISOString().slice(0, 10) !== value.slice(0, 10) ||
      Number(value.slice(11, 13)) > 23
    )
      return Number.NaN;
    return Date.parse(value);
  });
  if (!times.length || times.some((time) => !Number.isFinite(time)) || new Set(times).size !== 1)
    return {};
  return { publishedAt: new Date(times[0]!).toISOString() };
}

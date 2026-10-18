import { Effect, Layer } from "effect";

import { SearchProvider } from "../../application/ports.js";
import {
  allowedSearchDomains,
  parseGlmSearchResults,
  type ResearchSearchResult,
} from "../../domain/item/adapters/glm.js";
import type { SearchInput, SearchPage } from "../../domain/search/index.js";

type Options = {
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

const searchEndpoint = "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp";

export class GlmSearchClient {
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
    if (!query.trim() || query.length > 70) {
      throw new Error("Search query must contain 1 to 70 characters.");
    }
    const allowed = allowedSearchDomains(domains);
    const value = await this.call("web_search_prime", {
      search_query: query.trim(),
      location,
      ...(allowed.length === 1 ? { search_domain_filter: allowed[0] } : {}),
      content_size: "medium",
      search_recency_filter: recency,
    });
    const parsed = parseGlmSearchResults(value, allowed);
    observe?.({ rawResults: parsed.rawResults, domainRejected: parsed.domainRejected });
    return parsed.results;
  }

  /** News-shaped page for the provider port. Hybrid search keeps using `search`. */
  async searchPage(input: SearchInput): Promise<SearchPage> {
    const results = await this.search(input.query, [], "noLimit");
    return {
      provider: "glm",
      resultCount: results.length,
      results: results.map((result, index) => ({
        id: result.url,
        title: result.title,
        url: result.url,
        snippet: result.snippet,
        rankPosition: index + 1,
      })),
    };
  }

  private async call(name: string, args: Record<string, unknown>): Promise<unknown> {
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
        response = await this.fetchImpl(searchEndpoint, {
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
    if (initialized.protocolVersion !== "2024-11-05") {
      throw new Error("Unsupported GLM MCP protocol version.");
    }
    headers["MCP-Protocol-Version"] = "2024-11-05";
    await request("notifications/initialized");
    const result = await request("tools/call", { name, arguments: args }, 2);
    if (result.isError) throw new Error("GLM search tool failed.");
    const blocks = Array.isArray(result.content) ? result.content : [];
    const block = blocks
      .map(asRecord)
      .find((item) => item.type === "text" && typeof item.text === "string");
    if (!block) throw new Error("GLM MCP returned no text result.");
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

export const GlmSearchLive = (options: Options): Layer.Layer<SearchProvider> => {
  const client = new GlmSearchClient(options);
  return Layer.succeed(SearchProvider, {
    search: (input) =>
      Effect.tryPromise({
        try: () => client.searchPage(input),
        catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
      }),
  });
};

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

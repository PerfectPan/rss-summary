import type { GlmPage } from "../../../reading/index.js";

import { callMcpTool } from "../mcp-client.js";
import { publicUrl } from "../public-url.js";
import { pageFromPayload } from "./mapper.js";
import { readerPayload, text } from "./dto.js";

const readEndpoint = "https://open.bigmodel.cn/api/mcp/web_reader/mcp";

export type GlmReadOptions = {
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export async function readGlmPage(input: string, options: GlmReadOptions): Promise<GlmPage> {
  if (!options.apiKey.trim()) throw new Error("GLM_CODING_API_KEY is required.");
  const apiKey = options.apiKey.trim();
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const url = publicUrl(input);
  const value = await callMcpTool(
    {
      endpoint: readEndpoint,
      apiKey,
      fetchImpl,
      timeoutMs,
      toolFailedMessage: "GLM read tool failed.",
    },
    "webReader",
    {
      url: url.href,
      return_format: "text",
      retain_images: false,
      timeout: Math.max(1, Math.min(20, Math.floor(timeoutMs / 1000))),
    },
  );
  const resolved =
    typeof readerPayload(value).url === "string" ? publicUrl(text(readerPayload(value).url)) : url;
  return pageFromPayload(value, url, resolved);
}

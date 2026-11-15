import type { Layer } from "effect";

import type { SearchProvider } from "../../acquisition/index.js";

import { searchProviderLayer } from "../shared/search-plumbing.js";
import { DeepSeekSearchClient } from "./client.js";

export type DeepSeekSearchClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export const DeepSeekSearchLive = (options: DeepSeekSearchClientOptions): Layer.Layer<SearchProvider> =>
  searchProviderLayer(new DeepSeekSearchClient(options));

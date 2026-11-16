import type { Layer } from "effect";

import type { SearchProvider } from "../../acquisition/index.js";

import { searchProviderLayer } from "../shared/search-plumbing.js";
import { DoubaoSearchClient } from "./client.js";

export type DoubaoSearchClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export const DoubaoSearchLive = (options: DoubaoSearchClientOptions): Layer.Layer<SearchProvider> =>
  searchProviderLayer(new DoubaoSearchClient(options));

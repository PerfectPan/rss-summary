import { Effect } from "effect";

import { SearchProvider } from "../../acquisition/index.js";
import {
  describeSearchProvider,
  type ProviderStep,
} from "../../../tests/support/search-provider-suite.js";

import { DeepSeekSearchLive } from "./provider.js";

describeSearchProvider({
  name: "deepseek",
  emitsRateLimit: true,
  cacheable: true,
  create(next) {
    let invocations = 0;
    return {
      invocations: () => invocations,
      search: (value) => {
        invocations += 1;
        const step: ProviderStep = next();
        const fetchImpl: typeof fetch = async () => {
          if (step === "http_429") return new Response("slow", { status: 429 });
          if (step === "permanent") return new Response("no", { status: 500 });
          return new Response(
            JSON.stringify({
              results: [
                {
                  rerank_score: 2.4,
                  title: "Suite",
                  url: "https://example.com/suite",
                  snippet: "Suite result",
                  site_name: "Example",
                  date: "2026-08-16T02:00:00Z",
                  authority: 3,
                },
              ],
            }),
          );
        };
        return Effect.gen(function* () {
          const provider = yield* SearchProvider;
          return yield* provider.search(value);
        }).pipe(Effect.provide(DeepSeekSearchLive({ apiKey: "suite", fetch: fetchImpl })));
      },
    };
  },
});

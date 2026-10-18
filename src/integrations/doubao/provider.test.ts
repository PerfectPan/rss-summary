import { Effect } from "effect";

import { SearchProvider } from "../../acquisition/index.js";
import {
  describeSearchProvider,
  type ProviderStep,
} from "../../../tests/support/search-provider-suite.js";

import { DoubaoSearchLive } from "./provider.js";

describeSearchProvider({
  name: "doubao",
  emitsRateLimit: true,
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
              Result: {
                ResultCount: 1,
                WebResults: [
                  { Id: "suite", Title: "Suite", Url: "https://example.com/suite", SortId: 1 },
                ],
              },
            }),
          );
        };
        return Effect.gen(function* () {
          const provider = yield* SearchProvider;
          return yield* provider.search(value);
        }).pipe(Effect.provide(DoubaoSearchLive({ apiKey: "suite", fetch: fetchImpl })));
      },
    };
  },
});

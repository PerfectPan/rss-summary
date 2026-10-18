import { expect, it } from "vite-plus/test";

import { parseCacheRequest } from "./request.js";
import type { SearchInput } from "../../search/search.js";

const input: SearchInput = {
  query: "release",
  count: 5,
  day: "2026-09-29",
  sourcePolicy: "official",
};
const provider = "https://search.example/web";

it("fills the start day and rejects an inverted window", () => {
  expect(parseCacheRequest(input, provider)).toMatchObject({ sinceDay: "2026-09-29", provider });
  expect(() => parseCacheRequest({ ...input, sinceDay: "2026-09-30" }, provider)).toThrow(
    "Invalid search start date.",
  );
  expect(() =>
    parseCacheRequest(
      {
        ...input,
        window: { since: "2026-09-29T04:00:00Z", until: "2026-09-29T04:00:00Z" },
      },
      provider,
    ),
  ).toThrow("Invalid search time window.");
});

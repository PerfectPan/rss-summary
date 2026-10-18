import { describe, expect, it } from "vite-plus/test";

import { listingPublicationType } from "./publication.js";

describe("publication classification", () => {
  it("keeps the listing rules on tags alone", () => {
    expect(listingPublicationType(["Releases"])).toBe("release");
    expect(listingPublicationType(["papers"])).toBe("paper");
    expect(listingPublicationType([])).toBe("article");
  });
});

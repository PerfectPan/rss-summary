import type { GlmPage } from "../../../reading/index.js";

import { publicationTime, readerPayload, text } from "./dto.js";

/** Project a webReader payload onto the port's page, enforcing the origin rule. */
export function pageFromPayload(payload: unknown, requested: URL, resolvedUrl: URL): GlmPage {
  const value = readerPayload(payload);
  const content = text(value.content);
  if (!content.trim()) throw new Error("GLM Reader returned no readable content.");
  // A changed origin requires an explicit read so a redirect cannot silently replace the selected source.
  if (resolvedUrl.origin !== requested.origin)
    throw new Error("GLM Reader returned a different source origin.");
  return {
    title: text(value.title).slice(0, 500),
    url: resolvedUrl.href,
    content: content.slice(0, 16_000),
    truncated: content.length > 16_000,
    ...publicationTime(value.metadata),
  };
}

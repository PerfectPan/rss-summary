/**
 * The Grok CLI's provider identity for the search budget: a `grok://cli/v1/`
 * URL names one installed CLI model and is kept verbatim; HTTP identities
 * (other providers) drop credentials, queries, and trailing slashes.
 */
export const cliIdentity = /^grok:\/\/cli\/v1\/[a-zA-Z0-9._-]+$/u;

export function normalizeProvider(value: string): string {
  if (cliIdentity.test(value)) return value;
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("News search provider must be an HTTP URL or a Grok CLI identity.");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/u, "")}`;
}

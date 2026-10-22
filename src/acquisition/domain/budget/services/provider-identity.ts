/**
 * Service-neutral provider identities for the search budget: HTTP(S) URLs are
 * normalized to origin + path (dropping credentials and queries); every other
 * URL scheme (a provider's own identity scheme, e.g. a CLI installation) is
 * kept verbatim. Providers that need stricter rules declare their own
 * normalizer in their integration.
 */
export function normalizeHttpProvider(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") return value;
  return `${url.origin}${url.pathname.replace(/\/+$/u, "")}`;
}

export function publicUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("A public HTTP(S) URL is required.");
  }
  const host = url.hostname;
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !host.includes(".") ||
    host.includes(":") ||
    /^[\d.]+$/u.test(host) ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/iu.test(host)
  ) {
    throw new Error("A public HTTP(S) URL without credentials is required.");
  }
  return url;
}

export function allowedSearchDomains(domains: readonly string[]): string[] {
  return domains.map((domain) => {
    const url = publicUrl(`https://${domain}`);
    if (url.host !== domain.toLowerCase() || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("Source domains must be hostnames without paths or ports.");
    }
    return url.hostname;
  });
}

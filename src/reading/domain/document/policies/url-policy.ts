export function validateArticleResearchUrl(value: string): string {
  const url = validateResearchUrl(value);
  if (isVideoResearchUrl(url)) throw new Error("video research requires captions or a transcript");
  return url;
}

export function validateResearchUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("article URL must use http or https");
  }
  if (url.username || url.password) throw new Error("article URL must not contain credentials");
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "localhost.localdomain" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local") ||
    isPrivateIpv4(hostname)
  ) {
    throw new Error("article URL points to a private or local host");
  }
  return url.toString();
}

export function isVideoResearchUrl(value: string): boolean {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  const youtube =
    hostname === "youtube.com" ||
    hostname.endsWith(".youtube.com") ||
    hostname === "youtube-nocookie.com" ||
    hostname.endsWith(".youtube-nocookie.com");
  return (
    hostname === "youtu.be" ||
    hostname === "www.youtu.be" ||
    (youtube &&
      ((url.pathname === "/watch" && url.searchParams.has("v")) ||
        /^\/(?:shorts|live|embed)\/[^/]+/u.test(url.pathname))) ||
    /\.(?:mp4|m4v|webm|mov|m3u8)$/iu.test(url.pathname)
  );
}

export function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

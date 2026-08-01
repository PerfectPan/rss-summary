export function markdownLinkText(value: string): string {
  return value.replace(/([\\\[\]])/gu, "\\$1");
}

export function formatStarCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function displayTime(value: string | undefined): string | undefined {
  const match = /[T ](\d{2}:\d{2})/u.exec(value ?? "");
  return match?.[1];
}

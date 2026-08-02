import { formatCompactCount } from "../domain/text.js";

export function markdownLinkText(value: string): string {
  return value.replace(/([\\[\]])/gu, "\\$1");
}

export const formatStarCount = formatCompactCount;

export function displayTime(value: string | undefined): string | undefined {
  const match = /[T ](\d{2}:\d{2})/u.exec(value ?? "");
  return match?.[1];
}

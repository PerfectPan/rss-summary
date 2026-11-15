import type { RunAudit } from "../../../delivery/index.js";
import { calendarDayAtOffset } from "../../../kernel/index.js";

/** The Tool result both brief products return. */
export type RivusToolResult = {
  candidateCount: number;
  generatedAt: string;
  markdown: string;
  paperCandidateCount: number;
  windowLabel?: string;
  audit?: RunAudit;
};

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
}

export function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean.`);
  }
  return value;
}

/** The Tool input object guard: absent → `{}`, anything unobject-like is an error naming the tool. */
export function optionalToolInput(value: unknown, tool: string): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${tool} input must be an object.`);
  }
  return value as Record<string, unknown>;
}

/** The day/occurrence/onlyNew fields both brief Tools parse. */
export function briefBaseInput(input: Record<string, unknown>) {
  return {
    day: optionalString(input.day, "day"),
    occurrence: optionalString(input.occurrence, "occurrence"),
    onlyNew: optionalBoolean(input.onlyNew, "onlyNew")
  };
}

/** The brief Tools take a day or an occurrence, never both. */
export function assertNotBothDayAndOccurrence(input: { day?: string; occurrence?: string }): void {
  if (input.day && input.occurrence) {
    throw new Error("day and occurrence cannot be used together.");
  }
}

/** The occurrence's local calendar day, when an occurrence names one. */
export function occurrenceDayOf(input: { occurrence?: string }, timezoneOffset: string): string | undefined {
  return input.occurrence ? calendarDayAtOffset(input.occurrence, timezoneOffset) : undefined;
}

export function assertCalendarDay(day: string | undefined): void {
  if (day && !/^\d{4}-\d{2}-\d{2}$/u.test(day)) {
    throw new Error("day must use YYYY-MM-DD format.");
  }
}

/** The result block both brief Tools build from their document and rendered markdown. */
export function rivusToolResult(
  document: {
    candidates: { category: string }[];
    generatedAt: string;
    windowLabel?: string;
    audit?: RunAudit;
  },
  markdown: string
): RivusToolResult {
  const paperCandidateCount = document.candidates.filter((candidate) => candidate.category === "paper").length;
  return {
    candidateCount: document.candidates.length - paperCandidateCount,
    generatedAt: document.generatedAt,
    markdown,
    paperCandidateCount,
    ...(document.windowLabel ? { windowLabel: document.windowLabel } : {}),
    ...(document.audit ? { audit: document.audit } : {})
  };
}

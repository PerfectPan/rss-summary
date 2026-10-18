import type { DailyAiEditorialIssue } from "../value-objects/daily-ai.js";

export class DailyAiDraftValidationError extends Error {
  readonly code = "DAILY_AI_DRAFT_VALIDATION_FAILED";

  constructor(readonly issues: readonly DailyAiEditorialIssue[]) {
    super("Daily AI editorial draft must contain at least one valid item");
    this.name = "DailyAiDraftValidationError";
  }
}

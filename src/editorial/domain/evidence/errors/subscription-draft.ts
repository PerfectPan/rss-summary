export type SubscriptionDraftValidationIssue = {
  message: string;
  ref: string;
};

export class SubscriptionDraftValidationError extends Error {
  readonly code = "SUBSCRIPTION_SUMMARY_VALIDATION_FAILED";

  constructor(readonly issues: ReadonlyArray<SubscriptionDraftValidationIssue>) {
    super(
      `SUBSCRIPTION_SUMMARY_VALIDATION_FAILED: ${issues
        .map(({ message, ref }) => `${ref}: ${message}`)
        .join("; ")}. Regenerate the invalid summaries and call render again.`,
    );
    this.name = "SubscriptionDraftValidationError";
  }
}

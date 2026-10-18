/**
 * Daily AI delivery receipt. Committing returns a new receipt instead of
 * mutating `committed` in place, so a failed write leaves the caller's value
 * untouched and a retry can be attempted.
 */
export type DailyAiDeliveryReceipt = {
  id: string;
  occurrence: string;
  evidenceIds: string[];
  committed: boolean;
};

export function createDailyAiDeliveryReceipt(
  occurrence: string,
  evidenceIds: string[],
): DailyAiDeliveryReceipt {
  return {
    id: `daily-ai:${occurrence}`,
    occurrence,
    evidenceIds: [...new Set(evidenceIds)],
    committed: false,
  };
}

/**
 * Persist the committed receipt once delivery succeeded. Returns the new
 * committed receipt, or `undefined` when nothing was committed (delivery
 * failed or the receipt was already committed).
 */
export async function commitDailyAiDeliveryReceipt(
  receipt: DailyAiDeliveryReceipt,
  options: { delivered: boolean; save: (receipt: DailyAiDeliveryReceipt) => Promise<void> },
): Promise<DailyAiDeliveryReceipt | undefined> {
  if (!options.delivered || receipt.committed) return undefined;
  const committed = { ...receipt, committed: true };
  await options.save(committed);
  return committed;
}

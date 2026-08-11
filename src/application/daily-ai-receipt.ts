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

export async function commitDailyAiDeliveryReceipt(
  receipt: DailyAiDeliveryReceipt,
  options: { delivered: boolean; save: (receipt: DailyAiDeliveryReceipt) => Promise<void> },
): Promise<void> {
  if (!options.delivered || receipt.committed) return;
  await options.save({ ...receipt, committed: true });
  receipt.committed = true;
}

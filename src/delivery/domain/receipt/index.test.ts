import { describe, expect, it, vi } from "vite-plus/test";

import { commitDailyAiDeliveryReceipt, createDailyAiDeliveryReceipt } from "../../index.js";

describe("Daily AI delivery receipt", () => {
  it("writes seen state once only after successful delivery", async () => {
    const save = vi.fn(async () => undefined);
    let receipt = createDailyAiDeliveryReceipt("2026-08-11T01:00:00Z", ["s1"]);
    receipt = (await commitDailyAiDeliveryReceipt(receipt, { delivered: true, save })) ?? receipt;
    receipt = (await commitDailyAiDeliveryReceipt(receipt, { delivered: true, save })) ?? receipt;
    expect(save).toHaveBeenCalledTimes(1);
    expect(receipt.committed).toBe(true);
  });

  it("does not write on failure and permits a later successful retry", async () => {
    const save = vi.fn(async () => undefined);
    let receipt = createDailyAiDeliveryReceipt("2026-08-11T01:00:00Z", ["s1"]);
    receipt = (await commitDailyAiDeliveryReceipt(receipt, { delivered: false, save })) ?? receipt;
    expect(receipt.committed).toBe(false);
    receipt = (await commitDailyAiDeliveryReceipt(receipt, { delivered: true, save })) ?? receipt;
    expect(save).toHaveBeenCalledTimes(1);
    expect(receipt.committed).toBe(true);
  });
});

import { describe, expect, it, vi } from "vite-plus/test";

import {
  createDailyAiDeliveryReceipt,
  commitDailyAiDeliveryReceipt,
} from "../../src/application/daily-ai-receipt.js";

describe("Daily AI delivery receipt", () => {
  it("writes seen state once only after successful delivery", async () => {
    const save = vi.fn(async () => undefined);
    const receipt = createDailyAiDeliveryReceipt("2026-08-11T01:00:00Z", ["s1"]);
    await commitDailyAiDeliveryReceipt(receipt, { delivered: true, save });
    await commitDailyAiDeliveryReceipt(receipt, { delivered: true, save });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("does not write on failure and permits a later successful retry", async () => {
    const save = vi.fn(async () => undefined);
    const receipt = createDailyAiDeliveryReceipt("2026-08-11T01:00:00Z", ["s1"]);
    await commitDailyAiDeliveryReceipt(receipt, { delivered: false, save });
    await commitDailyAiDeliveryReceipt(receipt, { delivered: true, save });
    expect(save).toHaveBeenCalledTimes(1);
  });
});

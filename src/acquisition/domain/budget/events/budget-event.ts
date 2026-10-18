export type BudgetEvent =
  | {
      readonly _tag: "Reserved";
      readonly day: string;
      readonly dailyUsed: number;
      readonly monthlyUsed: number;
    }
  | { readonly _tag: "CacheHit"; readonly fetchedAt: string }
  | { readonly _tag: "CacheStored"; readonly key: string; readonly fetchedAt: string };

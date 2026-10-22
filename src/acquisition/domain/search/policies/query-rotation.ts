export function editionRotation(day: string, edition: "noon" | "evening"): number {
  return (
    Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000) * 2 + (edition === "evening" ? 1 : 0)
  );
}

export function selectQueryIds(
  queryIds: readonly string[],
  rotation: number,
  maxQueries: number,
): ReadonlySet<string> {
  const count = Math.min(maxQueries, queryIds.length);
  return new Set(
    Array.from({ length: count }, (_, offset) => queryIds[(rotation + offset) % queryIds.length]!),
  );
}

/** Same remainder split the hybrid brief used to spread a run's fallback quota. */
export function shareSearchBudget(
  budget: number,
  id: string,
  queryIds: readonly string[] | undefined,
  rotation: number,
): number {
  if (!queryIds?.length) return budget;
  const index = queryIds.indexOf(id);
  if (index < 0) return 0;
  const priority = (index - (rotation % queryIds.length) + queryIds.length) % queryIds.length;
  return Math.floor(budget / queryIds.length) + (priority < budget % queryIds.length ? 1 : 0);
}

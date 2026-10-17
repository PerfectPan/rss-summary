let sequence = 0;

/** Reset before each golden test so run ids stay independent of test order. */
export function resetUuid(): void {
  sequence = 0;
}

export function nextUuid(): `${string}-${string}-${string}-${string}-${string}` {
  sequence += 1;
  return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`;
}

import type { Acquired, Item } from "../../../acquisition/index.js";
import { ok, type Result } from "../../../kernel/result.js";

import { itemFromGitHubCard } from "../../shared/activity-card.js";
import type { DecodeFailure } from "../../shared/decode.js";
import { cardFromRaw, decodeEventCard } from "./dto.js";

export type GitHubAcquired = {
  item: Item;
  card: import("../../../acquisition/index.js").ActivityCardDto;
};

export function decodeGitHubEvent(input: unknown): Result<GitHubAcquired, DecodeFailure> {
  const decoded = decodeEventCard(input);
  if (decoded._tag === "Err") return decoded;
  const card = decoded.value;
  return ok({ card, item: itemFromGitHubCard(card) });
}

export function acquireGitHubEvent(input: unknown): Acquired {
  const decoded = decodeGitHubEvent(input);
  if (decoded._tag === "Err") {
    const card = cardFromRaw({});
    return { card, item: itemFromGitHubCard(card) };
  }
  return decoded.value;
}

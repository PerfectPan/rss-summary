# CONTEXT — Glossary

Domain vocabulary used across the code base. When a word is overloaded, the
"Same name, different meaning" rows say which file owns which sense.

## Acquisition

**Item** — the source-neutral model of "one piece of information"
(`src/acquisition/domain/item/value-objects/item.ts`). An adapter decides `kind`
(publication / paper / release / change / project / post), `subject`,
`content`, `publishedAt`, `provenance`, `credibility`, and `signals`; the
`display` field carries presentation text that rules never read. Editorial
consumes Items (types only) and never sees a source format.

**SignalType** — the closed vocabulary of why an Item exists
(`endorsed`, `recommended-trending`, `published-paper`, `change-merged`, …).
Adapters only decide "this is the signal"; the score table in editorial
decides what each signal is worth. The names are deliberately source-free so
the historical per-source scores could be reproduced exactly.

**Credibility** — how trustworthy a source is, split into `CredibilityTier`
(`official` / `authoritative` / `aggregator` / `unrated`) and
`CredibilityMethod` (`configured-domain` / `article-read`). Doubao's
authority level and GLM's source verification map into this; editorial's news
funnel consumes the tier.

**Acquired** — what a collection use case returns: `{ item, card }`
(`src/acquisition/domain/item/adapters/activity-card.ts`). The `item` is the
neutral record; the `card` is the `ActivityCardDto` projection of the same
Item, kept because ranking, JSON output, and skills read its fields.

**SearchBudget** — the aggregate over paid search requests
(`src/acquisition/domain/budget/aggregates/search-budget.ts`): daily/monthly limits,
per-request reservations (a reservation stays consumed even when the provider
fails), and the raw-response cache with sha256 keys. Persisted in
`.state/news-search.json`; shared by the news product and Daily AI's X
collection.

## Editorial

**Evidence** — the bounded, source-grounded projection shown to the Agent so
it can select and summarize. Two families: `SubscriptionEvidence` (PR / RSS
facts with a `summaryPolicy`) and `DailyAiEvidence` (id / title / URL / tier).
Same name, different meaning:

| Term                                                                       | Owner                                                              | Meaning                                                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `SubscriptionEvidence` / `DailyAiEvidence`                                 | editorial                                                          | the Agent-facing records above                                                                                   |
| transcript / visual evidence (`transcriptEvidence`, `videoVisualEvidence`) | reading (`src/reading/domain/document/adapters/video-evidence.ts`) | text built from captions, audio transcripts, and key-frame analysis when a video is read                         |
| `presentationEvidence` on `CandidateDecision`                              | editorial (`src/editorial/domain/decision/decision.ts`)            | the matched interest term or importance phrase that expanded an item to `summary` depth, stored in the run audit |
| `ActivityCardDto` (aliased `ActivityCard` in editorial)                    | acquisition                                                        | not evidence: the JSON activity card the CLI `--json` output exposes and skills consume, a projection of an Item |

**Decision** — a reasoned record of what happened to one candidate:
`CandidateDecision` (subscriptions/frontier: selected / research-pending /
filtered, with depth and presentation reason), `NewsHitDecision` /
`NewsStoryDecision` (news funnel stages), `DailyAiDecision` (evidence kept,
merged, or filtered). Decisions are data in the run audit; they are never
recomputed from a rendered document.

**Edition** — which scheduled slot a news brief fills:
`NewsBriefEdition = "noon" | "evening"` (`src/editorial/domain/news/value-objects/news.ts`).
It selects query rotation and rendering labels. It is not a software version
and not a synonym for the produced document (that is the brief / digest
document). The moment a run happens is its `occurrence`.

## Delivery

**Ledger** — the "already sent / already researched" memory in
`.state/feed-state.json` and `.state/industry-state.json`: `seen` event IDs,
`researched` research keys, and the only-new filtering rules over them.
Same name, different meaning: Rivus keeps its own delivery ledger for cards
it actually delivered; this repository's tools never write business seen
state.

`RunPresentationDepth` / `RunPresentationReasonCode`
(`src/delivery/domain/run-audit/index.ts`) are deliberate storage mirrors of
editorial's `PresentationDepth` / `PresentationReasonCode`: the persisted run
record keeps literal unions so its shape never shifts when editorial refines
its own types.

## App / rendering

**View IR** — the channel-independent structured document
(`src/app/render/view.ts`) that product layouts in `src/app/render/layouts/`
produce before rendering. Markdown and the Automation Presentation are
projections of it. Because Rivus hands the presentation hook only reply
text, `src/app/render/view-decode.ts` decodes Markdown back into a View IR
first. `--json` output is serialized from the product documents and does not
use the IR.

**Product** — one of the five assembled outputs (subscriptions, frontier,
news, daily-ai, research) registered in `src/app/products/index.ts`. Hosts
(CLI, Rivus plugin) iterate this registry; adding a host does not add a
product.

**Automation presentation** — the Rivus-facing projection of the View IR
(title, metadata, sections, items, source links) built by
`src/app/render/automation.ts`. Rivus's Renderer turns it into channel cards;
it is not Feishu CardKit JSON.

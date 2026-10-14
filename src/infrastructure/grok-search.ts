import { startOfCalendarDay } from "../domain/time.js";
import { GrokXClient } from "./grok-x.js";
import { NewsSearchError, type NewsSearchInput, type NewsSearchPage } from "./news-search.js";

type GrokOptions = {
  executable?: string;
  model?: string;
  timeoutMs?: number;
  timezoneOffset: string;
};

/** Broad topic discovery for the independent noon/evening news product. */
export class GrokSearchClient {
  private readonly client: GrokXClient;

  constructor(private readonly options: GrokOptions) {
    this.client = new GrokXClient(options);
  }

  async search(input: NewsSearchInput): Promise<NewsSearchPage> {
    if (input.sourcePolicy !== "news") {
      throw new NewsSearchError(
        "grok_source_policy",
        "Grok X search supports only the news source policy; author identity is not independently verified.",
      );
    }
    const since = startOfCalendarDay(input.sinceDay ?? input.day, this.options.timezoneOffset);
    const until = startOfCalendarDay(input.day, this.options.timezoneOffset) + 86_400_000;
    return this.client.search({
      instruction: [
        `Find recent news matching this topic: ${JSON.stringify(input.query)}.`,
        "Prefer original announcements. Exclude rumors, predictions, tutorials and reposts.",
      ].join("\n"),
      count: input.count,
      since: input.window?.since ?? new Date(since).toISOString(),
      until: input.window?.until ?? new Date(until).toISOString(),
    });
  }
}

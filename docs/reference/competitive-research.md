# Competitive Research: GitHub + RSS Digest

Checked on 2026-06-22.

## What Similar Products Do

- Feedly treats AI as a filtering layer on top of sources: saved AI feeds keep updating from the same query/fine-tuning, mute filters remove unwanted topics, and deduplication compares article content rather than only URLs.
- Inoreader separates filters from rules: filters remove duplicates or irrelevant items, while rules automate actions such as notifications, read-later saves, exports, and webhooks.
- Readwise Reader keeps feed organization user-controlled through Filtered Views and OPML import. Its Ghostreader behavior is conservative by default: feed items are not automatically summarized unless the user enables that with their own OpenAI key.
- Folo/RSSNext positions the product around a single timeline, AI RSS reading, and RSSHub as a large open RSS source network.
- GitHub `received_events` remains the closest API source for the GitHub Home Feed. GitHub documents that another token sees only public received events, and that this API is not real-time.

## Design Takeaways For This Repo

1. Keep source ingestion separate from ranking. GitHub events and RSS items should both become normalized activity cards.
2. Prefer explicit user controls first: feed list, tags, interests, time window, and max enriched repos.
3. Score before deep research. Only high-signal starred repos, releases, PRs, and tagged RSS articles should later trigger expensive LLM or browser research.
4. Add dedup/cache before automatic deep research. Competitors invest heavily in duplicate filtering; this repo should record researched repo/article IDs before adding recurring LLM research.
5. Keep summarization opt-in. Readwise's model is a good privacy/cost precedent: ingest and rank locally first, then add model-backed summaries only after explicit configuration.

## Sources

- Feedly AI Feeds: https://docs.feedly.com/article/769-saving-ai-feeds-feedly
- Feedly mute filters: https://docs.feedly.com/article/251-muting-topics
- Feedly deduplication: https://docs.feedly.com/article/218-how-does-deduplication-work
- Inoreader filters and rules: https://www.inoreader.com/blog/2023/06/streamline-content-discovery-with-filters-and-rules.html
- Inoreader automations: https://www.inoreader.com/blog/2026/01/save-time-with-automations.html
- Readwise Reader feeds: https://docs.readwise.io/reader/docs/faqs/feed
- Readwise Ghostreader: https://docs.readwise.io/reader/docs/faqs/ghostreader
- RSSNext/Folo: https://github.com/RSSNext/folo
- RSSNext ecosystem: https://github.com/RSSNext
- GitHub Events API: https://docs.github.com/v3/activity/events

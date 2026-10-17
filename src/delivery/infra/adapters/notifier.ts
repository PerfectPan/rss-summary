import { Effect, Layer } from "effect";

import { Notifier } from "../../application/ports.js";

export type NotifierOptions = {
  webhookUrl?: string;
  fetch?: typeof fetch;
  stdout?: Pick<typeof process.stdout, "write">;
};

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

/**
 * Always writes the markdown to stdout; when a webhook is configured the same
 * text is posted as `{ "text": ... }` and a non-2xx response fails the send.
 */
export const NotifierLive = (options: NotifierOptions = {}): Layer.Layer<Notifier> => {
  const fetchImpl = options.fetch ?? fetch;
  const stdout = options.stdout ?? process.stdout;
  const webhookUrl = options.webhookUrl;

  return Layer.succeed(Notifier, {
    channel: webhookUrl ? "webhook" : "stdout",
    send: (markdown: string) =>
      Effect.tryPromise({
        try: async () => {
          stdout.write(markdown);
          if (!markdown.endsWith("\n")) stdout.write("\n");

          if (!webhookUrl) return;

          const response = await fetchImpl(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: markdown }),
          });

          if (!response.ok) {
            throw new Error(
              `Webhook notification failed: ${response.status} ${await response.text()}`,
            );
          }
        },
        catch: toError,
      }),
  });
};

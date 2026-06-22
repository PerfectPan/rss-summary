export type Notifier = {
  send(markdown: string): Promise<void>;
};

export type NotifierOptions = {
  webhookUrl?: string;
  fetch?: typeof fetch;
  stdout?: Pick<typeof process.stdout, "write">;
};

export function createNotifier(options: NotifierOptions = {}): Notifier {
  const fetchImpl = options.fetch ?? fetch;
  const stdout = options.stdout ?? process.stdout;

  return {
    async send(markdown: string): Promise<void> {
      stdout.write(markdown);
      if (!markdown.endsWith("\n")) stdout.write("\n");

      if (!options.webhookUrl) return;

      const response = await fetchImpl(options.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: markdown }),
      });

      if (!response.ok) {
        throw new Error(`Webhook notification failed: ${response.status} ${await response.text()}`);
      }
    },
  };
}

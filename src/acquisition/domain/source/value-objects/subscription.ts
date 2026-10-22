export type FeedSubscription = {
  name: string;
  url: string;
  tags: string[];
};

export type WebPageSubscription = {
  type: "page";
  name: string;
  url: string;
  pathPrefixes: string[];
  tags: string[];
};

export type IndustrySource = FeedSubscription | WebPageSubscription;

export type FeedSubscriptionInput = {
  name?: string;
  url: string;
  tags?: string[];
};

export function isWebPageSource(source: IndustrySource): source is WebPageSubscription {
  return "type" in source && source.type === "page";
}

export {
  isWebPageSource,
  type FeedSubscription,
  type FeedSubscriptionInput,
  type IndustrySource,
  type WebPageSubscription,
} from "./value-objects/subscription.js";
export {
  addFeedSubscription,
  formatFeedSubscriptions,
  parseFeedSubscriptions,
  parseIndustrySources,
  removeFeedSubscription,
} from "./services/catalog.js";

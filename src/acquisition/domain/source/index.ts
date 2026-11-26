export {
  isWebPageSource,
  type FeedSubscription,
  type FeedSubscriptionInput,
  type IndustrySource,
  type WebPageSubscription
} from "./value-objects/subscription.js";
export { addFeedSubscription, removeFeedSubscription } from "./services/catalog.js";
/** @internal */
export { parseFeedSubscriptions, parseIndustrySources } from "./services/catalog.js";

/**
 * @sparq/analytics-js v2 — the canonical Sparq search-analytics SDK.
 *
 * Two ways in:
 * - v2 API (recommended): `SparqInsights` / `configureInsights` — typed
 *   methods for the full event taxonomy with queryID attribution built in.
 * - v1 compat: `StAnalyticsClient` (default export) — the exact v1 surface,
 *   for existing integrations.
 *
 * Consumed by @sparq/search-ui as its insights engine; usable standalone by
 * any custom search integration.
 */

export {
  SparqInsights,
  configureInsights,
  getInsights,
  setTrackingConsent,
  trackPurchase,
  type ClickTracking,
  type PurchaseData,
  type PurchaseItem,
  type SearchSource,
  type SearchTracking,
} from './insights';
export { WireClient, type InsightsConfig } from './wireClient';
export { clearClickMap, queryIdFor, rememberClick } from './clickMap';
export { clearSentOrders, rememberOrder, wasOrderReported } from './sentOrders';
export { default as Events } from './domain/Events';
export type { ISearchRequest, ISearchResponse } from './domain/ISearchResponse';

export { default as StAnalyticsClient, default } from './compat/StAnalyticsClient';

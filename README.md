# @sparq/analytics-js

Sparq search analytics SDK — reports search, click and purchase events to the Sparq pipeline with **queryID attribution** built in, so the Sparq dashboard can show CTR, search conversion and search-attributed revenue.

Zero dependencies. Ships ESM + CJS + a minified IIFE for script tags. Events are delivered with `fetch keepalive` (they survive page navigation) and never throw — analytics can never break your page.

> Using the Sparq Search UI widget? You don't need this package — the widget embeds it. Add the `insights` attribute to `<sparq-search>` instead. This SDK is for custom search integrations built directly on the Sparq API.

## Install

```sh
npm install @sparq/analytics-js
```

or script tag (exposes `window.SparqAnalytics`):

```html
<script src="https://cdn.sparq.ai/analytics-js@2/sparq-analytics.iife.global.js" defer></script>
```

## v2 API

```js
import { SparqInsights } from '@sparq/analytics-js';

const insights = new SparqInsights({
  appId: 'acme',
  apiKey: 'pk_search_xxx',      // your search-only token
  collection: 'products',
  // trackingHost: 'https://events.sparq.ai/v2'   (default; override for staging)
});

// After every settled search — pass the response's uniqueId as queryId:
insights.trackSearch({ query: 'shoes', queryId: response.uniqueId, totalItems: response.totalHits });

// When a shopper clicks a result (position is 1-based):
insights.trackClick({ itemId: '8821', queryId: response.uniqueId, position: 3 });

// On the order confirmation page — items are auto-attributed to the search
// whose result was clicked within the last hour:
insights.purchase({
  orderId: '10482',
  currency: 'EUR',
  items: [{ id: '8821', price: 39.9, quantity: 2 }],
});
```

Sessions (`search-session`), per-search dedupe, the 1-hour click→purchase attribution window, and the anonymous `uId` visitor cookie are all handled internally. `setUser(id)` overrides the visitor id; `setGlobalProps(obj)` merges properties into every event; `sendEvent(name, data)` is the generic escape hatch.

For pages without your own instance (e.g. a confirmation-page snippet): `configureInsights(cfg)` once, then `trackPurchase(order)`.

**Consent:** pass `consent: false` in the config (or call `setTrackingConsent(false)` before configuring) to start in the denied state — no events are sent and no cookie is written until `setConsent(true)` / `setTrackingConsent(true)` runs, e.g. from your cookie banner's accept handler.

## v1 compatibility

The v1 surface still works unchanged:

```js
import StAnalyticsClient from '@sparq/analytics-js';

const client = new StAnalyticsClient('appUniqueId', 'searchToken');
client.searchQuery(searchResponse, 'title', 'collectionId');
client.emptySearchResults(searchResponse, false, 'collectionId');
client.sendEvent('custom-event', { any: 'data' }, 'collectionId');
```

v2 differences (deliberate): the endpoint defaults to production and is configurable at runtime (3rd constructor arg or `ST_TRACKING_SERVER` under Node) instead of being baked in at build time; visitor ids generate locally (same `uId` cookie — identity carries over) instead of a blocking server round-trip; axios is gone.

## Development

```sh
npm run build       # tsup → dist/ (esm, cjs, dts, iife)
npm test            # vitest
npm run typecheck   # tsc --noEmit
```

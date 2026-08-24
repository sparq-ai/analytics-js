# Changelog

All notable changes to `@sparq/analytics-js` are documented here. This project
adheres to [Semantic Versioning](https://semver.org/).

## [2.0.2]

### Added

- `source` field on `trackSearch` (and the `SearchSource` type) — the entry
  point that reached the results (`autocomplete` / `search_results` /
  `category_browse`, with `recommendations` reserved), powering the Search
  channels breakdown. Optional and omitted from the wire when unset, so older
  callers are unchanged.
- `source` also flows through the v1-compat `StAnalyticsClient.searchQuery` as
  an additive optional argument.

## [2.0.1]

### Fixed

- `purchase-complete` is now deduplicated by `orderId` across confirmation-page
  reloads, so a refreshed thank-you page no longer double-counts an order.

## [2.0.0]

### Added

- Rewritten as the canonical Sparq search-analytics SDK: `SparqInsights` /
  `configureInsights` with queryID attribution, zero runtime dependencies,
  runtime-configurable endpoint, and a v1-compatible `StAnalyticsClient`
  wrapper for zero-code upgrades.

import { SparqInsights } from '../insights';
import Events from '../domain/Events';
import type { ISearchResponse } from '../domain/ISearchResponse';

/**
 * v1 API surface, preserved verbatim: ESM/bundler consumers upgrade with a
 * version bump and zero code changes. Plain CommonJS `require()` callers get a
 * namespace object (class at `.default`) instead of v1's `export =` class, and
 * the script-tag global is now `SparqAnalytics.StAnalyticsClient` — both are
 * documented in the README migration notes. Internally backed by the v2 engine —
 * fetch/beacon transport, runtime-configurable endpoint — instead of axios
 * with a build-time-baked URL.
 *
 * Differences from v1, all deliberate:
 * - The endpoint defaults to production and is overridable per instance (3rd
 *   constructor arg) or via ST_TRACKING_SERVER when running under Node.
 * - Visitor ids generate locally (crypto UUID, same `uId` cookie) instead of
 *   a blocking POST /u round-trip — no page-load event queue needed.
 */
export default class StAnalyticsClient {
  private insights: SparqInsights;

  constructor(
    private appUniqueId: string,
    searchToken: string,
    trackingHost?: string,
  ) {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    const envHost = env?.ST_TRACKING_SERVER;
    this.insights = new SparqInsights({
      appId: appUniqueId,
      apiKey: searchToken,
      trackingHost: trackingHost ?? envHost,
    });
  }

  public setUser(userId: string): this {
    this.insights.setUser(userId);
    return this;
  }

  public setGlobalProps(properties: Record<string, unknown>): this {
    this.insights.setGlobalProps(properties);
    return this;
  }

  public sendEvent(
    eventName: string,
    eventData: Record<string, unknown>,
    collectionUniqueId?: string,
  ): void {
    this.insights.sendEvent(eventName, eventData, collectionUniqueId);
  }

  /** v1 signature — same wire payload as v1 (top-10 items with rank + label). */
  public searchQuery(searchResponse: ISearchResponse, label: string, collectionUniqueId?: string): void {
    const top = searchResponse.results
      .slice(0, Math.min(searchResponse.totalHits, 10))
      .map((result, index) => ({ rank: index, label: (result as Record<string, unknown>)[label] }));
    this.insights.sendEvent(
      Events.searchQuery,
      {
        search: {
          query: searchResponse.query.query,
          queryId: searchResponse.uniqueId,
          responseTime: searchResponse.responseTime,
          totalHits: searchResponse.totalHits,
          items: top,
        },
      },
      collectionUniqueId,
    );
  }

  /** v1 signature. */
  public emptySearchResults(
    searchResponse: ISearchResponse,
    isFilterApplied: boolean,
    collectionUniqueId?: string,
  ): void {
    this.insights.sendEvent(
      Events.emptySearchQuery,
      {
        search: {
          query: searchResponse.query.query,
          queryId: searchResponse.uniqueId,
          responseTime: searchResponse.responseTime,
          isFilterApplied: isFilterApplied ?? false,
        },
      },
      collectionUniqueId,
    );
  }
}

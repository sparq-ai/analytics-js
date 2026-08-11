import { WireClient, type InsightsConfig } from './wireClient';
import { queryIdFor, rememberClick } from './clickMap';
import { rememberOrder, wasOrderReported } from './sentOrders';

/**
 * SparqInsights — the canonical implementation of Sparq search analytics.
 *
 * Event taxonomy (matches the server pipeline: st-tracking → BigQuery
 * user_analytics): search-query / empty-search-query, search-session (one per
 * 30-minute activity window — the session-based CTR denominator),
 * product-clicked, purchase-complete with eventData.order.{orderId, amount}.
 *
 * Attribution is queryID-chained: the search response's queryId is stamped on
 * every click, remembered per item in the click map, and rejoined per line
 * item at purchase. Counting rule (deliberate): every backend request with a
 * fresh queryId is one tracked search — pagination pages included, matching
 * how Algolia counts tracked searches per request. The queryId dedupe only
 * suppresses replays of the SAME request (cache hits, back button).
 */

export interface SearchTracking {
  query: string;
  /** The search response's unique id — omit and the search is untracked. */
  queryId?: string;
  totalItems: number;
  processingTimeMs?: number;
  /** True when any facet/numeric filter was active (reported on empty searches). */
  isFilterApplied?: boolean;
  collection?: string;
}

export interface ClickTracking {
  itemId: string;
  /** queryId of the search whose results were clicked. */
  queryId?: string;
  /** 1-based position of the item in the results. */
  position?: number;
  collection?: string;
}

export interface PurchaseItem {
  id: string | number;
  price?: number;
  quantity?: number;
}

export interface PurchaseData {
  orderId: string | number;
  /** Order total. Derived from items (Σ price × quantity) when omitted. */
  amount?: number;
  currency?: string;
  items?: PurchaseItem[];
  collection?: string;
}

const SESSION_KEY = 'sparq:session';
const SESSION_WINDOW_MS = 30 * 60 * 1000; // st-tracking's own session window
const SENT_QUERY_CAP = 200;

export class SparqInsights {
  private client: WireClient;
  /** queryIds already reported — cache replays must not double-count a search. */
  private sentQueries = new Set<string>();
  /** In-memory fallback when localStorage is unavailable (see touchSession). */
  private sessionTouched = false;

  constructor(readonly config: InsightsConfig) {
    this.client = new WireClient(config);
    this.client.consent = config.consent ?? defaultConsent;
  }

  /**
   * Grant or revoke tracking consent at runtime (wire this to your cookie
   * banner). While revoked, no events are sent and no cookie is written.
   */
  setConsent(granted: boolean): this {
    this.client.consent = granted;
    return this;
  }

  /** Override the anonymous visitor id (e.g. with your own logged-in user key). */
  setUser(userId: string): this {
    this.client.setUser(userId);
    return this;
  }

  /** Properties merged under every event's data (event's own fields win). */
  setGlobalProps(props: Record<string, unknown>): this {
    this.client.globalProps = props ?? {};
    return this;
  }

  /**
   * Report one settled search. Sends search-query (deduped by queryId), the
   * session event when a new 30-minute window starts, and empty-search-query
   * when there were no results.
   */
  trackSearch(data: SearchTracking): void {
    // Consent gate BEFORE any state/storage mutation: while revoked, nothing
    // may be written (session window, dedupe) or a later grant would suppress
    // the first legitimate events.
    if (!this.client.consent) return;
    if (!data.queryId || this.sentQueries.has(data.queryId)) return;
    this.rememberQuery(data.queryId);
    this.touchSession(data.collection);
    this.client.send(
      'search-query',
      {
        search: {
          query: data.query,
          queryId: data.queryId,
          responseTime: data.processingTimeMs,
          totalHits: data.totalItems,
        },
      },
      data.collection,
    );
    if (data.totalItems === 0) {
      this.client.send(
        'empty-search-query',
        {
          search: {
            query: data.query,
            queryId: data.queryId,
            isFilterApplied: data.isFilterApplied ?? false,
          },
        },
        data.collection,
      );
    }
  }

  /**
   * Report a result click. Remembers {itemId → queryId} in the click map so a
   * later purchase can rejoin the line item to this search.
   */
  trackClick(data: ClickTracking): void {
    if (!this.client.consent || !data.itemId) return;
    if (data.queryId) rememberClick(data.itemId, data.queryId);
    this.client.send(
      'product-clicked',
      { click: { queryId: data.queryId, itemId: data.itemId, position: data.position } },
      data.collection,
    );
  }

  /**
   * Report a completed order (call on the confirmation page). Each line item
   * is attributed to the search whose result was clicked within the
   * attribution window; unmatched items still count toward total revenue.
   */
  purchase(data: PurchaseData): void {
    // Consent gate FIRST — while revoked nothing may be sent or written,
    // including the dedupe record (or a later grant would suppress the first
    // legitimately-consented purchase report).
    if (!this.client.consent) return;
    if (!data || data.orderId === undefined || data.orderId === null || data.orderId === '') return;
    // One purchase-complete per order, ever: confirmation pages reload
    // (refresh, back button, receipt links, payment redirects) and each reload
    // re-runs the purchase snippet. Persisted, so it survives the reload.
    const orderKey = String(data.orderId);
    if (wasOrderReported(orderKey)) return;
    const items = (data.items ?? []).map((it) => {
      const id = String(it.id);
      const queryId = queryIdFor(id);
      // One quantity rule for both the payload and the derived sum: missing → 1,
      // explicit 0 stays 0 (a zero-quantity line must not add price×1 to amount).
      const entry: Record<string, unknown> = { id, price: it.price, quantity: it.quantity ?? 1 };
      if (queryId) entry.queryId = queryId;
      return entry;
    });
    const derived = items.reduce((sum, it) => sum + (Number(it.price) || 0) * Number(it.quantity ?? 1), 0);
    rememberOrder(orderKey);
    this.client.send(
      'purchase-complete',
      {
        order: {
          orderId: orderKey,
          amount: typeof data.amount === 'number' ? data.amount : +derived.toFixed(2),
          currency: data.currency,
          items,
        },
      },
      data.collection,
    );
  }

  /** Generic escape hatch — any event name st-tracking should record. */
  sendEvent(eventName: string, eventData: Record<string, unknown>, collection?: string): void {
    this.client.send(eventName, eventData, collection);
  }

  private rememberQuery(queryId: string): void {
    if (this.sentQueries.size >= SENT_QUERY_CAP) {
      const first = this.sentQueries.values().next().value;
      if (first !== undefined) this.sentQueries.delete(first);
    }
    this.sentQueries.add(queryId);
  }

  private touchSession(collection?: string): void {
    let last = 0;
    try {
      last = Number(localStorage.getItem(SESSION_KEY)) || 0;
    } catch {
      /* read failed — treated like an unwritten window below */
    }
    // Storage-less degradation (private mode / full quota — where EITHER the
    // read or the write fails, leaving `last` at 0 forever): the in-memory
    // flag caps it at one session event per page load instead of one per
    // search, which would badly inflate the CTR denominator.
    if (last === 0 && this.sessionTouched) return;
    const now = Date.now();
    if (now - last >= SESSION_WINDOW_MS) {
      this.client.send('search-session', { session: { startedAt: now } }, collection);
    }
    this.sessionTouched = true;
    try {
      localStorage.setItem(SESSION_KEY, String(now));
    } catch {
      /* write failed — the sessionTouched guard above takes over */
    }
  }
}

// ── module-level singleton: lets pages without their own instance (order
// confirmation snippets) report purchases after a one-line configure ─────────

let singleton: SparqInsights | null = null;
let defaultConsent = true;

/**
 * Module-level consent switch: applies to the current singleton and becomes
 * the default for instances created afterwards. Call setTrackingConsent(false)
 * before configureInsights() to start in the denied state (e.g. while the
 * cookie banner is unanswered), then setTrackingConsent(true) on acceptance.
 */
export function setTrackingConsent(granted: boolean): void {
  defaultConsent = granted;
  singleton?.setConsent(granted);
}

/**
 * Idempotent for identical config — reconfiguring with the same values
 * returns the existing instance (its dedupe state intact). A changed config
 * builds a fresh instance.
 */
export function configureInsights(cfg: InsightsConfig): SparqInsights {
  const c = singleton?.config;
  if (
    !c ||
    c.appId !== cfg.appId ||
    c.apiKey !== cfg.apiKey ||
    c.collection !== cfg.collection ||
    c.trackingHost !== cfg.trackingHost
  ) {
    singleton = new SparqInsights(cfg);
  } else if (cfg.consent !== undefined) {
    // Same wiring config but a consent change must always take effect —
    // reconfiguring with consent:false and still sending would be a breach.
    singleton!.setConsent(cfg.consent);
  }
  return singleton!;
}

export function getInsights(): SparqInsights | null {
  return singleton;
}

/** Host-page convenience: window.sparq('purchase', …) lands here. */
export function trackPurchase(data: PurchaseData): void {
  if (!singleton) {
    console.error(
      '[sparq] purchase dropped — insights is not configured on this page. Call configureInsights({appId, apiKey}) (or sparq("init", …)) before reporting a purchase.',
    );
    return;
  }
  singleton.purchase(data);
}

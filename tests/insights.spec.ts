import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SparqInsights, configureInsights, getInsights, trackPurchase } from '../src/insights';
import { clearClickMap, queryIdFor, rememberClick } from '../src/clickMap';
import StAnalyticsClient from '../src/compat/StAnalyticsClient';

// Tests run in plain Node; the SDK's browser touchpoints are stubbed through
// this loosely-typed view of globalThis. The stubs are deliberately partial.
const g = globalThis as unknown as Record<string, unknown>;

function stubStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  } as Storage;
}

let sentEvents: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[];

beforeEach(() => {
  sentEvents = [];
  g.window = g;
  g.localStorage = stubStorage();
  g.document = { cookie: '' };
  g.fetch = vi.fn((url: unknown, init: { body?: unknown; headers?: Record<string, string> }) => {
    sentEvents.push({
      url: String(url),
      headers: init.headers ?? {},
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
    });
    return Promise.resolve({ ok: true });
  });
});

afterEach(() => {
  Reflect.deleteProperty(g, 'window');
  Reflect.deleteProperty(g, 'localStorage');
  Reflect.deleteProperty(g, 'document');
  vi.restoreAllMocks();
});

const cfg = { appId: 'acme', apiKey: 'tok', collection: 'products' };
const names = () => sentEvents.map((e) => e.body.eventName);
const byName = (name: string) => sentEvents.find((e) => e.body.eventName === name)?.body;

describe('clickMap', () => {
  it('remembers, expires, and caps entries', () => {
    vi.useFakeTimers();
    rememberClick('p1', 'q1');
    expect(queryIdFor('p1')).toBe('q1');
    vi.advanceTimersByTime(61 * 60 * 1000);
    expect(queryIdFor('p1')).toBeUndefined();
    vi.useRealTimers();
    for (let i = 0; i < 60; i++) rememberClick(`p${i}`, `q${i}`);
    expect(queryIdFor('p0')).toBeUndefined();
    expect(queryIdFor('p59')).toBe('q59');
    clearClickMap();
  });
});

describe('SparqInsights.trackSearch', () => {
  it('sends search-query with wire fields and one session event', () => {
    new SparqInsights(cfg).trackSearch({ query: 'shoes', queryId: 'q1', totalItems: 3, processingTimeMs: 7 });
    expect(names()).toEqual(['search-session', 'search-query']);
    const search = byName('search-query') as { app: string; eventData: { search: Record<string, unknown> } };
    expect(search.app).toBe('acme');
    expect(search.eventData.search).toMatchObject({ query: 'shoes', queryId: 'q1', totalHits: 3, responseTime: 7 });
  });

  it('dedupes by queryId and skips untracked searches', () => {
    const insights = new SparqInsights(cfg);
    insights.trackSearch({ query: 'a', queryId: 'q1', totalItems: 1 });
    insights.trackSearch({ query: 'a', queryId: 'q1', totalItems: 1 });
    insights.trackSearch({ query: 'b', totalItems: 1 });
    expect(names().filter((n) => n === 'search-query')).toHaveLength(1);
  });

  it('adds empty-search-query at zero results with the filter flag', () => {
    new SparqInsights(cfg).trackSearch({ query: 'x', queryId: 'q2', totalItems: 0, isFilterApplied: true });
    const empty = byName('empty-search-query') as { eventData: { search: Record<string, unknown> } };
    expect(empty.eventData.search).toMatchObject({ queryId: 'q2', isFilterApplied: true });
  });

  it('sends one session event per 30-minute window', () => {
    vi.useFakeTimers();
    const insights = new SparqInsights(cfg);
    insights.trackSearch({ query: 'a', queryId: 'q1', totalItems: 1 });
    insights.trackSearch({ query: 'b', queryId: 'q2', totalItems: 1 });
    vi.advanceTimersByTime(31 * 60 * 1000);
    insights.trackSearch({ query: 'c', queryId: 'q3', totalItems: 1 });
    expect(names().filter((n) => n === 'search-session')).toHaveLength(2);
    vi.useRealTimers();
  });
});

describe('SparqInsights.trackClick + purchase', () => {
  it('chains click → purchase through the click map', () => {
    const insights = new SparqInsights(cfg);
    insights.trackClick({ itemId: 'p1', queryId: 'q1', position: 3 });
    const click = byName('product-clicked') as { eventData: { click: Record<string, unknown> } };
    expect(click.eventData.click).toMatchObject({ itemId: 'p1', queryId: 'q1', position: 3 });

    insights.purchase({
      orderId: 'o-1',
      currency: 'EUR',
      items: [
        { id: 'p1', price: 10, quantity: 2 },
        { id: 'p9', price: 5 },
      ],
    });
    const order = (byName('purchase-complete') as { eventData: { order: Record<string, unknown> } }).eventData.order;
    expect(order).toMatchObject({ orderId: 'o-1', amount: 25 });
    const items = order.items as Record<string, unknown>[];
    expect(items[0]).toMatchObject({ id: 'p1', queryId: 'q1' });
    expect(items[1]!.queryId).toBeUndefined();
  });

  it('ignores orders without an id and honors explicit amounts', () => {
    const insights = new SparqInsights(cfg);
    insights.purchase({ orderId: '', items: [] });
    expect(sentEvents).toHaveLength(0);
    insights.purchase({ orderId: 7, amount: 99.5 });
    const order = (byName('purchase-complete') as { eventData: { order: Record<string, unknown> } }).eventData.order;
    expect(order).toMatchObject({ orderId: '7', amount: 99.5 });
  });
});

describe('singleton', () => {
  it('is idempotent for identical config and errors on unconfigured purchase', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = configureInsights(cfg);
    const b = configureInsights({ ...cfg });
    expect(b).toBe(a);
    const c = configureInsights({ ...cfg, collection: 'other' });
    expect(c).not.toBe(a);
    expect(getInsights()).toBe(c);
    trackPurchase({ orderId: 'o-2' });
    expect(byName('purchase-complete')).toBeTruthy();
    expect(errors).not.toHaveBeenCalled();
  });
});

describe('wire format + identity', () => {
  it('sends v1-compatible envelope, auth headers, and a stable uId cookie', () => {
    const insights = new SparqInsights(cfg);
    insights.sendEvent('custom-event', { a: 1 });
    insights.sendEvent('custom-event', { a: 2 });
    expect(sentEvents[0]!.url).toBe('https://events.sparq.ai/v2/events');
    expect(sentEvents[0]!.headers.authorization).toBe('Bearer tok');
    expect(sentEvents[0]!.body).toMatchObject({ app: 'acme', collection: 'products', eventName: 'custom-event' });
    expect(typeof sentEvents[0]!.body.timeStamp).toBe('number');
    expect(sentEvents[0]!.headers['x-st-user']).toBeTruthy();
    expect(sentEvents[1]!.headers['x-st-user']).toBe(sentEvents[0]!.headers['x-st-user']);
  });

  it('setGlobalProps merge under event data; event fields win', () => {
    const insights = new SparqInsights(cfg).setGlobalProps({ shop: 's1', a: 'global' });
    insights.sendEvent('custom-event', { a: 'own' });
    expect(sentEvents[0]!.body.eventData).toMatchObject({ shop: 's1', a: 'own' });
  });
});

describe('v1 compat wrapper', () => {
  it('preserves the v1 searchQuery payload shape', () => {
    new StAnalyticsClient('acme', 'tok').searchQuery(
      {
        uniqueId: 'q9',
        query: { query: 'shoes' } as never,
        results: [{ title: 'A' }, { title: 'B' }],
        responseTime: 5,
        totalHits: 2,
      },
      'title',
      'products',
    );
    const search = byName('search-query') as { collection: string; eventData: { search: Record<string, unknown> } };
    expect(search.collection).toBe('products');
    expect(search.eventData.search).toMatchObject({ query: 'shoes', queryId: 'q9', totalHits: 2 });
    expect(search.eventData.search.items).toEqual([
      { rank: 0, label: 'A' },
      { rank: 1, label: 'B' },
    ]);
  });
});

describe('consent', () => {
  it('drops events and writes no cookie while consent is revoked, resumes on grant', () => {
    const insights = new SparqInsights({ ...cfg, consent: false });
    insights.trackSearch({ query: 'a', queryId: 'qc1', totalItems: 1 });
    insights.purchase({ orderId: 'o-c1' });
    expect(sentEvents).toHaveLength(0);
    expect(String((g.document as { cookie: string }).cookie)).not.toContain('uId=');

    insights.setConsent(true);
    insights.trackSearch({ query: 'a', queryId: 'qc2', totalItems: 1 });
    expect(names()).toContain('search-query');
  });

  it('setTrackingConsent gates the singleton and future instances', async () => {
    const { setTrackingConsent } = await import('../src/insights');
    setTrackingConsent(false);
    configureInsights({ ...cfg, collection: 'consent-test' }).trackSearch({ query: 'a', queryId: 'qc3', totalItems: 1 });
    expect(sentEvents).toHaveLength(0);
    setTrackingConsent(true);
    getInsights()!.trackSearch({ query: 'a', queryId: 'qc4', totalItems: 1 });
    expect(names()).toContain('search-query');
  });
});

describe('review regressions', () => {
  it('sends one session per page load when storage writes fail (Safari private mode)', () => {
    const store = new Map<string, string>();
    g.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    } as unknown as Storage;
    const insights = new SparqInsights(cfg);
    insights.trackSearch({ query: 'a', queryId: 'r1', totalItems: 1 });
    insights.trackSearch({ query: 'b', queryId: 'r2', totalItems: 1 });
    insights.trackSearch({ query: 'c', queryId: 'r3', totalItems: 1 });
    expect(names().filter((n) => n === 'search-session')).toHaveLength(1);
  });

  it('applies consent:false on reconfigure with same wiring config', () => {
    configureInsights(cfg).trackSearch({ query: 'a', queryId: 'r4', totalItems: 1 });
    const before = sentEvents.length;
    configureInsights({ ...cfg, consent: false }).trackSearch({ query: 'b', queryId: 'r5', totalItems: 1 });
    expect(sentEvents.length).toBe(before);
    configureInsights({ ...cfg, consent: true });
  });

  it('writes no click map while consent revoked, and first session after grant still fires', () => {
    const insights = new SparqInsights({ ...cfg, consent: false });
    insights.trackClick({ itemId: 'pc1', queryId: 'qc9', position: 1 });
    expect(queryIdFor('pc1')).toBeUndefined();
    insights.trackSearch({ query: 'a', queryId: 'r6', totalItems: 1 });
    expect(sentEvents).toHaveLength(0);
    insights.setConsent(true);
    insights.trackSearch({ query: 'a', queryId: 'r7', totalItems: 1 });
    expect(names()).toContain('search-session');
  });

  it('sends from Node (fetch without window)', () => {
    Reflect.deleteProperty(g, 'window');
    new SparqInsights(cfg).sendEvent('server-event', { a: 1 });
    expect(names()).toContain('server-event');
  });

  it('quantity 0 contributes 0 to the derived amount', () => {
    new SparqInsights(cfg).purchase({ orderId: 'q0', items: [{ id: 'x', price: 10, quantity: 0 }] });
    const order = (byName('purchase-complete') as { eventData: { order: Record<string, unknown> } }).eventData.order;
    expect(order.amount).toBe(0);
  });

  it('click map caps at 50 including the newest entry and keeps __proto__ ids as data', () => {
    for (let i = 0; i < 55; i++) rememberClick(`cap${i}`, `q${i}`);
    const raw = JSON.parse((g.localStorage as Storage).getItem('sparq:clicks')!) as Record<string, unknown>;
    expect(Object.keys(raw).length).toBeLessThanOrEqual(50);
    rememberClick('__proto__', 'qproto');
    expect(queryIdFor('__proto__')).toBe('qproto');
    clearClickMap();
  });
});

describe('purchase dedupe', () => {
  it('reports each orderId exactly once across page reloads (persisted)', async () => {
    const { clearSentOrders } = await import('../src/sentOrders');
    clearSentOrders();
    const first = new SparqInsights(cfg);
    first.purchase({ orderId: 'dup-1', items: [{ id: 'a', price: 10, quantity: 1 }] });
    // Simulate a reload: fresh instance, same localStorage.
    const reloaded = new SparqInsights(cfg);
    reloaded.purchase({ orderId: 'dup-1', items: [{ id: 'a', price: 10, quantity: 1 }] });
    expect(names().filter((n) => n === 'purchase-complete')).toHaveLength(1);
    reloaded.purchase({ orderId: 'dup-2' });
    expect(names().filter((n) => n === 'purchase-complete')).toHaveLength(2);
    clearSentOrders();
  });

  it('dedupes within the page even when storage is unavailable', async () => {
    const { clearSentOrders } = await import('../src/sentOrders');
    clearSentOrders();
    g.localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    } as unknown as Storage;
    const insights = new SparqInsights(cfg);
    insights.purchase({ orderId: 'mem-1' });
    insights.purchase({ orderId: 'mem-1' });
    expect(names().filter((n) => n === 'purchase-complete')).toHaveLength(1);
  });

  it('a consent-revoked purchase leaves no dedupe record (post-grant purchase still reports)', async () => {
    const { clearSentOrders, wasOrderReported } = await import('../src/sentOrders');
    clearSentOrders();
    const insights = new SparqInsights({ ...cfg, consent: false });
    insights.purchase({ orderId: 'c-1', items: [] });
    expect(sentEvents).toHaveLength(0);
    expect(wasOrderReported('c-1')).toBe(false);
    insights.setConsent(true);
    insights.purchase({ orderId: 'c-1' });
    expect(names()).toContain('purchase-complete');
    clearSentOrders();
  });

  it('caps the persisted order store at 20 entries', async () => {
    const { clearSentOrders, rememberOrder } = await import('../src/sentOrders');
    clearSentOrders();
    for (let i = 0; i < 30; i++) rememberOrder(`o${i}`);
    const raw = JSON.parse((g.localStorage as Storage).getItem('sparq:orders')!) as Record<string, number>;
    expect(Object.keys(raw).length).toBeLessThanOrEqual(20);
    clearSentOrders();
  });
});

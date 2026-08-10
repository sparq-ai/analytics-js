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

/**
 * Purchase dedupe memory. A confirmation page is reloaded far more often than
 * a purchase happens — refresh, back button, bookmarked receipt, email link,
 * payment-provider redirects — and every load re-runs the purchase snippet.
 * Without a persistent record of reported orderIds, each reload emits another
 * purchase-complete and inflates order counts and revenue.
 *
 * Mirrors clickMap.ts: localStorage-backed (a reload is a fresh page, so
 * in-memory alone is useless), null-prototype store, capped with
 * oldest-first eviction, every storage touch failure-swallowing. An
 * in-memory fallback set still dedupes within one page's lifetime when
 * storage is unavailable (private mode / full quota).
 */

const KEY = 'sparq:orders';
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 20;

type OrderStore = Record<string, number>;

const memoryFallback = new Set<string>();

function load(): OrderStore {
  const store: OrderStore = Object.create(null);
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'number') store[k] = v;
      }
    }
  } catch {
    /* corrupted or unavailable storage — start empty */
  }
  return store;
}

function prune(store: OrderStore, max: number): OrderStore {
  const now = Date.now();
  const live = Object.entries(store).filter(([, ts]) => now - ts < RETENTION_MS);
  live.sort((a, b) => a[1] - b[1]);
  const out: OrderStore = Object.create(null);
  for (const [k, v] of live.slice(-max)) out[k] = v;
  return out;
}

export function wasOrderReported(orderId: string): boolean {
  if (memoryFallback.has(orderId)) return true;
  const entry = load()[orderId];
  return typeof entry === 'number' && Date.now() - entry < RETENTION_MS;
}

export function rememberOrder(orderId: string): void {
  if (!orderId) return;
  memoryFallback.add(orderId);
  // Cap to MAX_ENTRIES - 1 before inserting so the persisted store never
  // exceeds MAX_ENTRIES.
  const store = prune(load(), MAX_ENTRIES - 1);
  store[orderId] = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable — the in-memory fallback still covers this page */
  }
}

export function clearSentOrders(): void {
  memoryFallback.clear();
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * The click map is what lets a purchase pages later prove which search caused
 * it: at click time we remember {itemId → queryId} in localStorage; at
 * purchase time each line item looks itself up. Entries expire after the
 * attribution window (search intent decays fast — Algolia uses the same 1h)
 * and the map is capped so localStorage never grows unbounded. All storage
 * access is failure-swallowing (Safari private mode, disabled storage).
 */

const KEY = 'sparq:clicks';
const ATTRIBUTION_WINDOW_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 50;

type ClickEntry = { queryId: string; ts: number };
type ClickStore = Record<string, ClickEntry>;

function load(): ClickStore {
  // Null-prototype store: item ids are attacker-influenced keys ("__proto__"
  // as a product id must be data, not prototype pollution / a dropped entry).
  const store: ClickStore = Object.create(null);
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed)) store[k] = v as ClickEntry;
    }
  } catch {
    /* corrupted or unavailable storage — start empty */
  }
  return store;
}

function save(store: ClickStore): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable */
  }
}

function prune(store: ClickStore, max: number): ClickStore {
  const now = Date.now();
  const live = Object.entries(store).filter(([, e]) => e && now - e.ts < ATTRIBUTION_WINDOW_MS);
  // Oldest first so the cap drops stale clicks, not fresh ones.
  live.sort((a, b) => a[1].ts - b[1].ts);
  const out: ClickStore = Object.create(null);
  for (const [k, v] of live.slice(-max)) out[k] = v;
  return out;
}

export function rememberClick(itemId: string, queryId: string): void {
  if (!itemId || !queryId) return;
  // Cap to MAX_ENTRIES - 1 BEFORE inserting so the persisted store never
  // exceeds MAX_ENTRIES.
  const store = prune(load(), MAX_ENTRIES - 1);
  store[itemId] = { queryId, ts: Date.now() };
  save(store);
}

/** queryId for an item clicked within the attribution window, else undefined. */
export function queryIdFor(itemId: string): string | undefined {
  const entry = load()[itemId];
  return entry && Date.now() - entry.ts < ATTRIBUTION_WINDOW_MS ? entry.queryId : undefined;
}

export function clearClickMap(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

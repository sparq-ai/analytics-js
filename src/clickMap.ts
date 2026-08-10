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
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as ClickStore) : {};
  } catch {
    return {};
  }
}

function save(store: ClickStore): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable */
  }
}

function prune(store: ClickStore): ClickStore {
  const now = Date.now();
  const live = Object.entries(store).filter(([, e]) => e && now - e.ts < ATTRIBUTION_WINDOW_MS);
  // Oldest first so the cap drops stale clicks, not fresh ones.
  live.sort((a, b) => a[1].ts - b[1].ts);
  return Object.fromEntries(live.slice(-MAX_ENTRIES));
}

export function rememberClick(itemId: string, queryId: string): void {
  if (!itemId || !queryId) return;
  const store = prune(load());
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

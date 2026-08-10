/**
 * The one place that knows the st-tracking REST contract: endpoint, auth
 * headers, payload envelope, and the `uId` identity cookie. Byte-compatible
 * with what v1 of this SDK sent, so the server pipeline and visitor identity
 * are continuous across the upgrade.
 *
 * Transport: fetch with keepalive (events fired right before navigation —
 * result clicks, purchases — still complete), falling back to sendBeacon with
 * auth in the query string where fetch is unavailable. Every storage or
 * network touch swallows failures: analytics must never break the host page.
 */

export interface InsightsConfig {
  appId: string;
  /** The store's search token — st-tracking scopes it to the app. */
  apiKey: string;
  collection?: string;
  /** Override the tracking endpoint (staging / self-hosted). No trailing slash. */
  trackingHost?: string;
}

const DEFAULT_HOST = 'https://events.sparq.ai/v2';
const UID_COOKIE = 'uId'; // shared with v1 — do not rename
const UID_TTL_DAYS = 367 * 2; // matches v1 cookie lifetime

function readCookie(name: string): string | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return m ? decodeURIComponent(m[1]!) : null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string, days: number): void {
  try {
    const expires = new Date(Date.now() + days * 86_400_000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; expires=${expires}; SameSite=Lax`;
  } catch {
    /* cookies disabled */
  }
}

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

export class WireClient {
  private host: string;
  /** Explicit override via setUser() — wins over the cookie. */
  private explicitUserId: string | null = null;
  /** Merged under every event's data (event's own fields win). */
  globalProps: Record<string, unknown> = {};

  constructor(private cfg: InsightsConfig) {
    this.host = (cfg.trackingHost ?? DEFAULT_HOST).replace(/\/$/, '');
  }

  setUser(userId: string): void {
    this.explicitUserId = userId;
    writeCookie(UID_COOKIE, userId, UID_TTL_DAYS);
  }

  /** Stable pseudonymous visitor id (cookie-persisted, v1-compatible). */
  userId(): string {
    if (this.explicitUserId) return this.explicitUserId;
    let id = readCookie(UID_COOKIE);
    if (!id) id = randomId();
    // Re-write on every read to slide the expiry, like v1 did.
    writeCookie(UID_COOKIE, id, UID_TTL_DAYS);
    return id;
  }

  /** Fire-and-forget. Never throws, never blocks the host page. */
  send(eventName: string, eventData: Record<string, unknown>, collection?: string): void {
    if (typeof window === 'undefined') return;
    const body = JSON.stringify({
      app: this.cfg.appId,
      collection: collection ?? this.cfg.collection,
      eventName,
      eventData: { ...this.globalProps, ...eventData },
      meta: {},
      timeStamp: Date.now(),
    });
    const user = this.userId();
    try {
      if (typeof fetch === 'function') {
        fetch(`${this.host}/events`, {
          method: 'POST',
          keepalive: true,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.cfg.apiKey}`,
            'x-st-user': user,
          },
          body,
        }).catch(() => {});
        return;
      }
      // sendBeacon cannot set headers — auth/identity ride the query string
      // (st-tracking accepts ?u=; a host that doesn't simply drops the event).
      navigator.sendBeacon?.(
        `${this.host}/events?token=${encodeURIComponent(this.cfg.apiKey)}&u=${encodeURIComponent(user)}`,
        new Blob([body], { type: 'application/json' }),
      );
    } catch {
      /* never surface tracking failures */
    }
  }
}

// Robust Bearer-Attacher für serverFn-Aufrufe.
// Wichtig: NICHT zusätzlich den generierten attachSupabaseAuth registrieren.
// Dieser Attacher wartet kurz auf die Session-Hydration, refresht den Token
// nur kurz vor Ablauf und hängt nie bewusst einen abgelaufenen
// Token an. Das verhindert "Unauthorized: Invalid token" nach Deploy/Idle.
import { createMiddleware } from '@tanstack/react-start';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './client';

// Nur erneuern, wenn der Token bald abläuft. Ein erzwungener Refresh bei
// jedem Aufruf rotiert das Refresh-Token ständig; mehrere Tabs oder ein
// gebremster Anmeldedienst führen dann zu Abmeldungen alle paar Minuten.
const REFRESH_BEFORE_EXPIRY_SEC = 120;
const SESSION_WAIT_MS = 1_500;

let refreshInFlight: Promise<string | null> | null = null;

function isBrowser() {
  return typeof window !== 'undefined';
}

function isJwtLike(token: string | null | undefined): token is string {
  return typeof token === 'string' && token.split('.').length === 3;
}

async function waitForStoredSession() {
  const first = await supabase.auth.getSession();
  if (first.data.session) return first.data.session;

  if (!isBrowser()) return null;

  return await new Promise<Session | null>((resolve) => {
    let done = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const finish = (session: Session | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      subscription?.unsubscribe();
      resolve(session ?? null);
    };

    const timer = window.setTimeout(() => finish(null), SESSION_WAIT_MS);

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        finish(session);
      }
    });
    subscription = data.subscription;
    if (done) subscription.unsubscribe();
  });
}

/** Pure decision helper, exported for tests. */
export function needsRefresh(expiresAtSec: number, nowSec: number): boolean {
  return expiresAtSec > 0 && expiresAtSec - nowSec < REFRESH_BEFORE_EXPIRY_SEC;
}

async function getFreshAccessToken(): Promise<string | null> {
  try {
    const session = await waitForStoredSession();
    if (!session) return null;

    const expiresAt = session.expires_at ?? 0; // unix seconds
    const nowSec = Math.floor(Date.now() / 1000);

    if (needsRefresh(expiresAt, nowSec)) {
      refreshInFlight ??= supabase.auth.refreshSession()
        .then(({ data, error }) => {
          if (error || !data.session?.access_token) return null;
          return data.session.access_token;
        })
        .catch(() => null)
        .finally(() => {
          refreshInFlight = null;
        });

      const refreshedToken = await refreshInFlight;
      if (isJwtLike(refreshedToken)) return refreshedToken;
      // Refresh fehlgeschlagen (z. B. kurz nicht erreichbar): Wir melden hier
      // niemanden ab. Ist das Refresh-Token wirklich ungültig, meldet der
      // Supabase-Client selbst ab. Noch gültigen Token weiter verwenden.
      if (isJwtLike(session.access_token) && expiresAt > nowSec) return session.access_token;
      return null;
    }

    return isJwtLike(session.access_token) ? session.access_token : null;
  } catch {
    return null;
  }
}

export const attachSupabaseBearer = createMiddleware({ type: 'function' }).client(
  async ({ next }) => {
    const token = await getFreshAccessToken();
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);

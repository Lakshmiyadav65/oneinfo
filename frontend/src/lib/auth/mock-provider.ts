import type { Creator } from "@/types/creator";
import { AuthError, type AuthProvider } from "@/lib/auth/types";

/**
 * Development-only mock auth used while Supabase is not yet configured
 * (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY unset).
 *
 * Two seeded creators exist so the app shell can be proven to change based
 * on the authenticated identity, not on any hardcoded creator. This must
 * never run when Supabase is configured.
 */

export const SESSION_COOKIE = "oneinfo_dev_session";

const DEMO_CREATORS: Record<string, Creator> = {
  "creator-a@oneinfo.dev": {
    id: "creator-a",
    name: "Demo Creator A",
    email: "creator-a@oneinfo.dev",
  },
  "creator-b@oneinfo.dev": {
    id: "creator-b",
    name: "Demo Creator B",
    email: "creator-b@oneinfo.dev",
  },
};

export const MOCK_DEMO_ACCOUNTS = Object.keys(DEMO_CREATORS);

/**
 * The creator behind an address, invented on the spot if it is a new one.
 *
 * The two demo accounts keep their fixed ids so the work already filed
 * under them stays theirs. Any other address becomes its own creator, named
 * after itself - everything behind the login is already per-creator, so a
 * fixed list of two here was the only thing stopping a third from existing.
 */
function creatorFor(email: string): Creator {
  const address = email.trim().toLowerCase();
  const demo = DEMO_CREATORS[address];
  if (demo) return demo;
  return {
    // The address doubles as the id. It is stable, readable in the sidebar,
    // and the backend's dev verifier reads a name out of it.
    id: address,
    name: address.split("@")[0] || address,
    email: address,
  };
}

function setSessionCookie(creatorId: string) {
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(
    creatorId
  )}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
}

function clearSessionCookie() {
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

function readSessionCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export const mockAuthProvider: AuthProvider = {
  async signInWithPassword(email, password) {
    const address = email.trim().toLowerCase();
    // Matches the backend's dev verifier, which refuses anything it could
    // not use as a primary key and a storage path segment. Checked here so
    // the answer is a message on the form rather than a 401 one call later.
    if (!/^[A-Za-z0-9._@+-]{1,255}$/.test(address) || password.length === 0) {
      throw new AuthError("Invalid credentials");
    }
    const creator = creatorFor(address);
    setSessionCookie(creator.id);
    return creator;
  },

  async signOut() {
    clearSessionCookie();
  },

  getSession() {
    const creatorId = readSessionCookie();
    if (!creatorId) return null;
    // Rebuilt from the cookie rather than looked up in the demo list. Looking
    // it up returned null for every creator that was not one of the two, so
    // a new account was signed out again the moment the page reloaded.
    return (
      Object.values(DEMO_CREATORS).find((c) => c.id === creatorId) ??
      creatorFor(creatorId)
    );
  },

  getAuthToken() {
    const creatorId = readSessionCookie();
    return creatorId ? `dev:${creatorId}` : null;
  },
};

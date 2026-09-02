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
    const creator = DEMO_CREATORS[email.trim().toLowerCase()];
    if (!creator || password.length === 0) {
      throw new AuthError("Invalid credentials");
    }
    setSessionCookie(creator.id);
    return creator;
  },

  async signOut() {
    clearSessionCookie();
  },

  getSession() {
    const creatorId = readSessionCookie();
    if (!creatorId) return null;
    return (
      Object.values(DEMO_CREATORS).find((c) => c.id === creatorId) ?? null
    );
  },
};

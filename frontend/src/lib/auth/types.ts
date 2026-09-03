import type { Creator } from "@/types/creator";

export class AuthError extends Error {}

/**
 * Provider-agnostic auth boundary. A real Supabase-backed implementation
 * (Phase 02) can satisfy this same interface, so nothing above this layer
 * needs to change when mock auth is retired.
 */
export interface AuthProvider {
  signInWithPassword(email: string, password: string): Promise<Creator>;
  signOut(): Promise<void>;
  getSession(): Creator | null;
  getAuthToken(): string | null;
}

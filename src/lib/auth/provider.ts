import { isSupabaseConfigured } from "@/config/env";
import { mockAuthProvider } from "@/lib/auth/mock-provider";
import type { AuthProvider } from "@/lib/auth/types";

/**
 * Resolves the active auth provider. Supabase integration lands with the
 * backend in Phase 02; until NEXT_PUBLIC_SUPABASE_URL/ANON_KEY are set this
 * always resolves to the dev-only mock provider.
 */
export function getAuthProvider(): AuthProvider {
  if (isSupabaseConfigured) {
    throw new Error(
      "Supabase is configured but the Supabase auth provider is not implemented yet."
    );
  }
  return mockAuthProvider;
}

export const isMockAuth = !isSupabaseConfigured;

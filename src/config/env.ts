/**
 * Frontend-safe environment configuration.
 *
 * Only NEXT_PUBLIC_* variables may live here. Provider secrets
 * (Gemini, Groq, OpenAI, Veo, storage, Supabase service role, etc.)
 * must never be read on the client — they belong to the backend only.
 */

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "",
} as const;

export const isSupabaseConfigured = Boolean(
  env.supabaseUrl && env.supabaseAnonKey
);

export const isApiConfigured = Boolean(env.apiUrl);

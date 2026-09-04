import type { ContentStatus } from "@/types/script";

/** Mirrors the backend's LocalizedLanguage enum. */
export type LocalizedLanguage = "tanglish" | "tenglish" | "telugu";

/**
 * Labels cover every language the backend can return — "tanglish" included,
 * so scripts generated before Tamil was dropped from the picker still display
 * with a proper name rather than a raw enum value.
 */
export const LANGUAGE_LABELS: Record<LocalizedLanguage, string> = {
  tanglish: "Tanglish",
  tenglish: "Tenglish",
  telugu: "Telugu",
};

/** What creators can actually pick. Tamil isn't offered. */
export const LOCALIZED_LANGUAGES: {
  value: LocalizedLanguage;
  label: string;
  hint: string;
}[] = [
  { value: "tenglish", label: "Tenglish", hint: "Telugu + English, written in English letters" },
  { value: "telugu", label: "Telugu", hint: "Pure Telugu, in తెలుగు script" },
];

export type Tanglish = {
  id: string;
  version: number;
  language: LocalizedLanguage;
  content: string;
  status: ContentStatus;
  created_at: string;
  updated_at: string;
};

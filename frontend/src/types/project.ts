export type ProjectStatus =
  | "draft"
  | "hooks"
  | "script"
  | "tanglish"
  | "storyboard"
  | "generating"
  | "completed"
  | "failed";

export type ProjectLanguage = "english" | "tenglish" | "telugu";

export const PROJECT_LANGUAGES: { value: ProjectLanguage; label: string; hint: string }[] = [
  { value: "english", label: "English", hint: "Plain English" },
  // Tenglish, not Tanglish — Tanglish is Tamil-English, and the localization
  // step reads this value.
  { value: "tenglish", label: "Tenglish", hint: "Telugu in Latin script, the way people talk" },
  { value: "telugu", label: "Telugu", hint: "Telugu script" },
];

export type Project = {
  id: string;
  title: string;
  idea: string;
  language: ProjectLanguage;
  status: ProjectStatus;
  selected_hook_id: string | null;
  created_at: string;
  updated_at: string;
};

export type IdeaSuggestion = {
  text: string;
  angle: string;
};

export type IdeaSuggestions = {
  ideas: IdeaSuggestion[];
  /** False when the creator has filed no knowledge, so ideas are generic. */
  grounded_in_knowledge: boolean;
};

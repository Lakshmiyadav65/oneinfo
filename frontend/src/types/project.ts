export type ProjectStatus =
  | "draft"
  | "hooks"
  | "script"
  | "tanglish"
  | "storyboard"
  | "generating"
  | "completed"
  | "failed";

export type Project = {
  id: string;
  title: string;
  idea: string;
  status: ProjectStatus;
  selected_hook_id: string | null;
  created_at: string;
  updated_at: string;
};

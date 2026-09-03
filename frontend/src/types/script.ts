export type ContentStatus = "draft" | "approved";

export type Script = {
  id: string;
  version: number;
  title: string;
  language: string;
  content: string;
  estimated_duration_seconds: number | null;
  status: ContentStatus;
  created_at: string;
  updated_at: string;
};

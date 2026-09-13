export type ContentStatus = "draft" | "approved";

/**
 * One stop on the roadmap the script was researched from. Written by the
 * script agent before any line of the script, and kept alongside it: this is
 * what the creator checks the script against.
 */
export type RoadmapStep = {
  order: number;
  topic: string;
  detail: string;
};

export type Script = {
  id: string;
  version: number;
  title: string;
  language: string;
  content: string;
  estimated_duration_seconds: number | null;
  // Null for scripts written before the agent researched its topics.
  roadmap: RoadmapStep[] | null;
  status: ContentStatus;
  created_at: string;
  updated_at: string;
};

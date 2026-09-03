export type JobStatus = "queued" | "processing" | "completed" | "failed";

export type GenerationJob = {
  id: string;
  status: JobStatus;
  current_stage: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type VideoOutput = {
  id: string;
  mime_type: string;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  url: string;
};

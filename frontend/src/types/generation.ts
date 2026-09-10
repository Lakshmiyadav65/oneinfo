export type JobStatus = "queued" | "processing" | "completed" | "failed";

export type GenerationJob = {
  id: string;
  /** Null for a full render; set when only one scene was generated. */
  scene_id: string | null;
  status: JobStatus;
  current_stage: string | null;
  /** Null until the run knows how many scenes it is rendering. */
  scenes_total: number | null;
  scenes_completed: number | null;
  /** True for a free run that only combined clips already on hand. */
  stitch_only: boolean;
  /** One sentence, written for the creator. */
  error_message: string | null;
  /** The raw provider/ffmpeg text behind it, for diagnosis. */
  error_detail: string | null;
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

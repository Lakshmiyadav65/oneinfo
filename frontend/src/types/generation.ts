export type JobStatus = "queued" | "processing" | "completed" | "failed";

/** The frame a finished video is exported at. Mirrors ExportFormat on the
 * server, which is deliberately not the generation aspect ratio: an export
 * is ffmpeg alone, so it can produce a square that Veo will not generate. */
export type ExportFormat = "9:16" | "16:9" | "1:1";

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
  /** Set when the run was an export, naming the frame it is producing. */
  export_aspect_ratio: ExportFormat | null;
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

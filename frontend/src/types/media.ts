/**
 * Something the creator generated. Mirrors backend/app/schemas/media.py.
 *
 * A finished video and a scene clip are kept as distinct kinds rather than
 * flattened: one is the deliverable, the other is a part that made it, and
 * the library is more useful when it can say which.
 */

export type MediaKind = "video" | "clip";

export type MediaItem = {
  id: string;
  kind: MediaKind;
  project_id: string;
  project_title: string;
  /** What this is within its project: "Finished video", "Scene 3 · take 2". */
  label: string;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  /** Auth-gated proxy route, fetched through the API client. */
  url: string;
  created_at: string;
};

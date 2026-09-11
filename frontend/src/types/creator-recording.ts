/** One angle the capture session measured and confirmed. */
export type ConfirmedAngle = {
  angle: "front" | "left" | "right";
  offset_seconds: number;
  yaw_degrees: number | null;
};

/**
 * The live capture a creator's reference frames were cut from.
 *
 * Kept after the frames are extracted so an angle can be re-cut without
 * asking someone to film themselves again. One per creator — a new capture
 * replaces it.
 */
export type CreatorRecording = {
  id: string;
  mime_type: string;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  file_size_bytes: number | null;
  angles: ConfirmedAngle[];
  created_at: string;
};

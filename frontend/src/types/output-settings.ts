/**
 * What a video is generated at. Mirrors backend/app/schemas/output_settings.py.
 *
 * Every field here changes what a run costs, which is why they are the
 * creator's choices rather than configuration. Clip length is deliberately
 * not among them: a scene's length is decided per scene in the storyboard,
 * where it can be weighed against what that scene has to say.
 */

export type AspectRatio = "16:9" | "9:16";
export type Resolution = "720p" | "1080p";
/** Named by what is being chosen, not by model id: ids change every release. */
export type ModelTier = "lite" | "fast";
export type Takes = 1 | 2 | 3 | 4;

export type OutputSettings = {
  aspect_ratio: AspectRatio;
  resolution: Resolution;
  model_tier: ModelTier;
  takes: Takes;
};

export const DEFAULT_OUTPUT_SETTINGS: OutputSettings = {
  aspect_ratio: "9:16",
  resolution: "720p",
  model_tier: "lite",
  takes: 1,
};

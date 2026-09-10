import type { Storyboard, StoryboardScene } from "@/types/storyboard";
import type { OutputSettings, ModelTier, Resolution } from "@/types/output-settings";
import { DEFAULT_OUTPUT_SETTINGS } from "@/types/output-settings";

// Veo bills per second of generated video. Surfaced per scene because the
// on-camera toggle is the main thing driving what a video costs, and that
// shouldn't be invisible.
//
// These are converted list prices, not observed invoices. The GCP bill is
// the authority; this is a forecast, and the panel says so.
export const B_ROLL_RUPEES_PER_SECOND = 4.78;
export const ON_CAMERA_RUPEES_PER_SECOND = 14.33;

const TIER_RATE: Record<ModelTier, number> = {
  lite: B_ROLL_RUPEES_PER_SECOND,
  fast: ON_CAMERA_RUPEES_PER_SECOND,
};

// 1080p is billed above 720p. A multiplier rather than a second rate table,
// so a tier's price stays in one place.
const RESOLUTION_MULTIPLIER: Record<Resolution, number> = {
  "720p": 1,
  "1080p": 2,
};

// Veo only renders 8-second clips when the creator is in frame, so turning a
// scene on-camera also stretches it to 8s. The surcharge has to price that,
// not just the rate difference on the current length.
const ON_CAMERA_SECONDS = 8;

function rupees(amount: number): string {
  return `₹${Math.round(amount)}`;
}

/**
 * One scene, one take. An on-camera scene always runs on the reference tier
 * regardless of the project's choice: Lite rejects reference images outright,
 * so there is no cheaper option to offer.
 */
export function sceneRate(onCamera: boolean, output: OutputSettings): number {
  const tier = onCamera ? ON_CAMERA_RUPEES_PER_SECOND : TIER_RATE[output.model_tier];
  return tier * RESOLUTION_MULTIPLIER[output.resolution];
}

export function sceneCost(
  durationSeconds: number,
  onCamera: boolean,
  output: OutputSettings = DEFAULT_OUTPUT_SETTINGS
): string {
  return rupees(durationSeconds * sceneRate(onCamera, output) * output.takes);
}

export function onCameraSurcharge(
  durationSeconds: number,
  output: OutputSettings = DEFAULT_OUTPUT_SETTINGS
): string {
  const extra =
    ON_CAMERA_SECONDS * sceneRate(true, output) -
    durationSeconds * sceneRate(false, output);
  return rupees(extra * output.takes);
}

function totalRupees(scenes: StoryboardScene[], output: OutputSettings): number {
  return (
    scenes.reduce(
      (sum, scene) => sum + scene.duration_seconds * sceneRate(scene.features_creator, output),
      0
    ) * output.takes
  );
}

export function storyboardCost(
  storyboard: Storyboard,
  output: OutputSettings = DEFAULT_OUTPUT_SETTINGS
): string {
  return rupees(totalRupees(storyboard.scenes, output));
}

/**
 * What the same storyboard would cost under different settings, so the panel
 * can price a choice before the creator commits to it.
 */
export function storyboardCostUnder(
  storyboard: Storyboard,
  output: OutputSettings,
  change: Partial<OutputSettings>
): string {
  return rupees(totalRupees(storyboard.scenes, { ...output, ...change }));
}

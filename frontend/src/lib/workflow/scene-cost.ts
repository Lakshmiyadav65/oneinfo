import type { Storyboard } from "@/types/storyboard";

// Veo bills per second, and an on-camera scene runs on a pricier model than
// b-roll. Surfaced per scene because the on-camera toggle is the main thing
// driving what a video costs, and that shouldn't be invisible.
export const B_ROLL_RUPEES_PER_SECOND = 4.78;
export const ON_CAMERA_RUPEES_PER_SECOND = 14.33;

// Veo only renders 8-second clips when the creator is in frame, so turning a
// scene on-camera also stretches it to 8s. The surcharge has to price that,
// not just the rate difference on the current length.
const ON_CAMERA_SECONDS = 8;

export function sceneCost(durationSeconds: number, onCamera: boolean): string {
  const rate = onCamera ? ON_CAMERA_RUPEES_PER_SECOND : B_ROLL_RUPEES_PER_SECOND;
  return `₹${Math.round(durationSeconds * rate)}`;
}

export function onCameraSurcharge(durationSeconds: number): string {
  const extra =
    ON_CAMERA_SECONDS * ON_CAMERA_RUPEES_PER_SECOND -
    durationSeconds * B_ROLL_RUPEES_PER_SECOND;
  return `₹${Math.round(extra)}`;
}

export function storyboardCost(storyboard: Storyboard): string {
  const total = storyboard.scenes.reduce(
    (sum, scene) =>
      sum +
      scene.duration_seconds *
        (scene.features_creator ? ON_CAMERA_RUPEES_PER_SECOND : B_ROLL_RUPEES_PER_SECOND),
    0
  );
  return `₹${Math.round(total)}`;
}

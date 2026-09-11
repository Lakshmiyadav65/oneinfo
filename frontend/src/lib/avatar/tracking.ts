/**
 * Reading a head pose out of one face-landmarker result.
 *
 * Deliberately free of React and of the DOM: everything here takes plain
 * numbers, so the thresholds that decide whether a capture locks can be
 * reasoned about — and later tested — without a camera attached.
 *
 * Sign convention, used everywhere below: positive yaw means the head is
 * turned toward the person's OWN left. The preview is mirrored so it behaves
 * like a mirror, but landmarks come from the raw camera frame and are not
 * mirrored, so the instructions the creator reads map straight onto these
 * numbers with no flip in between.
 */

/** The subset of the MediaPipe result this module actually reads. */
export type Landmark = { x: number; y: number; z?: number };
export type LandmarkerResult = {
  faceLandmarks: Landmark[][];
  facialTransformationMatrixes?: { data: number[] }[];
};

// MediaPipe face mesh indices. 1 is the nose tip; 33 and 263 are the outer
// corners of the two eyes. Which of the pair is which side depends on the
// convention, so nothing below assumes it — they are sorted by x instead.
const NOSE_TIP = 1;
const EYE_CORNERS = [33, 263] as const;

// Turns the nose-between-the-eyes ratio into something shaped like degrees.
// Calibrated against the ratio reaching roughly 0.15 / 0.85 at a 35 degree
// turn. Approximate on purpose: its job is to be monotonic and correctly
// signed, and the matrix below supplies the real magnitude when it can.
const RATIO_TO_DEGREES = 200;

export const ANGLE_TARGETS = {
  front: { label: "front", min: -8, max: 8 },
  left: { label: "left", min: 25, max: 55 },
  right: { label: "right", min: -55, max: -25 },
} as const;

export type AngleName = keyof typeof ANGLE_TARGETS;
export const ANGLE_ORDER: AngleName[] = ["front", "left", "right"];

/** How long a target has to be held before the angle counts as confirmed. */
export const DWELL_MS = 600;
/** How long one angle may be attempted before the session gives up on it. */
export const STAGE_TIMEOUT_MS = 15_000;
/** How long the framing check has to stay clean before recording starts. */
export const FRAMING_HOLD_MS = 1_000;

/**
 * Yaw from the outer eye corners and the nose between them.
 *
 * Works in raw image space, so its SIGN is unambiguous: turning toward your
 * own left moves your nose toward the right-hand side of the camera's frame.
 * Its magnitude is only an estimate.
 */
export function yawFromLandmarks(landmarks: Landmark[]): number | null {
  const nose = landmarks[NOSE_TIP];
  const corners = EYE_CORNERS.map((i) => landmarks[i]);
  if (!nose || corners.some((c) => !c)) return null;

  const [near, far] = corners.sort((a, b) => a.x - b.x);
  const span = far.x - near.x;
  // A head turned far enough that the eyes line up has no usable ratio left.
  if (span < 1e-4) return null;

  const ratio = (nose.x - near.x) / span;
  return (ratio - 0.5) * RATIO_TO_DEGREES;
}

/**
 * Yaw from the facial transformation matrix, in real degrees.
 *
 * Returned UNSIGNED. MediaPipe's matrix is column-major and its handedness
 * is easy to read backwards, and a capture that locks the left angle when
 * someone turns right is worse than one that is merely approximate. The sign
 * comes from the landmarks, which cannot be misread.
 */
export function yawMagnitudeFromMatrix(matrix: number[] | undefined): number | null {
  if (!matrix || matrix.length < 16) return null;
  // Column-major: the third basis vector's x and z components carry the
  // rotation about the vertical axis.
  const r02 = matrix[8];
  const r22 = matrix[10];
  if (!Number.isFinite(r02) || !Number.isFinite(r22)) return null;
  return Math.abs((Math.atan2(r02, r22) * 180) / Math.PI);
}

/**
 * The head's yaw in degrees, or null when there is no usable face.
 *
 * Takes the magnitude from the matrix when one is available and the sign from
 * the landmarks always. Neither source is trusted for the half it is weak at.
 */
export function yawDegrees(result: LandmarkerResult): number | null {
  const landmarks = result.faceLandmarks?.[0];
  if (!landmarks?.length) return null;

  const approximate = yawFromLandmarks(landmarks);
  if (approximate === null) return null;

  const magnitude = yawMagnitudeFromMatrix(result.facialTransformationMatrixes?.[0]?.data);
  if (magnitude === null) return approximate;

  // Near centre the landmark sign is noise, but so is the magnitude, so it
  // does not matter which way a fraction of a degree points.
  return Math.sign(approximate) * magnitude;
}

export type FrameProblem =
  | "no-face"
  | "many-faces"
  | "too-small"
  | "off-centre"
  | "too-dark";

const PROBLEM_TEXT: Record<FrameProblem, string> = {
  "no-face": "Move into frame so the camera can see your face.",
  "many-faces": "More than one face in shot. It needs to be just you.",
  "too-small": "Come closer, so your face fills more of the frame.",
  "off-centre": "Centre your face in the frame.",
  "too-dark": "It's too dark. Face a window or turn a light on.",
};

export function problemText(problem: FrameProblem): string {
  return PROBLEM_TEXT[problem];
}

/** Mean luma below this and the reference frames come out unusable. */
const MIN_BRIGHTNESS = 45;
/** The face has to occupy at least this fraction of the frame's height. */
const MIN_FACE_HEIGHT = 0.22;
/** How far the face's centre may sit from the frame's, as a fraction. */
const MAX_OFFSET = 0.22;

/**
 * Why this frame is unusable, or null when it is fine.
 *
 * Checked before recording starts rather than after it finishes. A creator
 * who films the whole session backlit should be told at the top, not handed
 * three dim reference frames and a worse video weeks later.
 */
export function frameQuality(
  result: LandmarkerResult,
  brightness: number | null
): FrameProblem | null {
  const faces = result.faceLandmarks ?? [];
  if (faces.length === 0) return "no-face";
  if (faces.length > 1) return "many-faces";

  const landmarks = faces[0];
  const xs = landmarks.map((p) => p.x);
  const ys = landmarks.map((p) => p.y);
  const height = Math.max(...ys) - Math.min(...ys);
  if (height < MIN_FACE_HEIGHT) return "too-small";

  const centreX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centreY = (Math.min(...ys) + Math.max(...ys)) / 2;
  if (Math.abs(centreX - 0.5) > MAX_OFFSET || Math.abs(centreY - 0.5) > MAX_OFFSET) {
    return "off-centre";
  }

  // Null means the brightness probe could not run. Blocking the whole
  // session on a check that is unavailable would be worse than skipping it.
  if (brightness !== null && brightness < MIN_BRIGHTNESS) return "too-dark";

  return null;
}

/** Whether a measured yaw is inside the target for this angle. */
export function isOnTarget(angle: AngleName, yaw: number | null): boolean {
  if (yaw === null) return false;
  const target = ANGLE_TARGETS[angle];
  return yaw >= target.min && yaw <= target.max;
}

/**
 * What to tell the creator right now, given where their head actually is.
 *
 * Specific in both directions. "Turn left" is no help to someone who has
 * already turned too far, and a session that only ever repeats the
 * instruction reads as broken rather than patient.
 */
export function guidanceFor(angle: AngleName, yaw: number | null): string {
  if (yaw === null) return problemText("no-face");
  const target = ANGLE_TARGETS[angle];
  if (yaw >= target.min && yaw <= target.max) return "Hold it.";

  if (angle === "front") {
    return yaw > target.max
      ? "Turn back to your right, towards the camera."
      : "Turn back to your left, towards the camera.";
  }
  if (angle === "left") {
    return yaw < target.min ? "Turn further to your left." : "That's too far — come back a little.";
  }
  return yaw > target.max ? "Turn further to your right." : "That's too far — come back a little.";
}

export const ANGLE_INSTRUCTIONS: Record<AngleName, string> = {
  front: "Look straight at the camera.",
  left: "Slowly turn your head to your left.",
  right: "Slowly turn your head to your right.",
};

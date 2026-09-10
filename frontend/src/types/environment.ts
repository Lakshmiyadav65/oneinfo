/**
 * How a scene is filmed. Mirrors backend/app/schemas/environment.py — the
 * values are what gets stored, the labels here are only what a person reads.
 *
 * Note there is no `on_camera` field. Whether the creator is in frame stays
 * on the scene as `features_creator`, where it decides what the scene costs;
 * a second copy would eventually disagree with it about money.
 */

export type EnvironmentPreset =
  | "youtube_studio"
  | "podcast"
  | "office"
  | "home"
  | "outdoor"
  | "classroom"
  | "product_demo"
  | "cinematic"
  | "custom";

export type Background =
  | "clean_studio"
  | "modern_office"
  | "home_interior"
  | "outdoor"
  | "classroom"
  | "custom";

export type CameraFraming =
  | "wide"
  | "medium"
  | "medium_close_up"
  | "close_up"
  | "over_the_shoulder"
  | "full_body";

export type CameraAngle = "eye_level" | "low_angle" | "high_angle" | "over_the_shoulder";

export type CameraMovement =
  | "static"
  | "slow_push_in"
  | "slow_pull_out"
  | "handheld"
  | "pan"
  | "tracking";

export type Lighting =
  | "natural"
  | "soft_studio"
  | "warm"
  | "cool"
  | "dramatic"
  | "high_key"
  | "low_key";

export type VisualStyle =
  | "realistic"
  | "cinematic"
  | "documentary"
  | "professional"
  | "social_media"
  | "commercial"
  | "educational";

export type Subject = "creator" | "product" | "people" | "environment" | "screen";

export type SceneEnvironment = {
  preset: EnvironmentPreset;
  background: Background;
  camera_framing: CameraFraming;
  camera_angle: CameraAngle;
  camera_movement: CameraMovement;
  lighting: Lighting;
  visual_style: VisualStyle;
  subject: Subject;
  custom_setup: string;
  custom_background: string;
  additional_requirements: string;
};

/** Emoji rather than an icon set: the app pulls no icon pack beyond lucide,
 *  and these read at chip size without adding a dependency. */
export const ENVIRONMENT_PRESETS: {
  value: EnvironmentPreset;
  icon: string;
  label: string;
  description: string;
}[] = [
  {
    value: "youtube_studio",
    icon: "🎬",
    label: "YouTube Studio",
    description: "Professional creator setup for talking-head videos.",
  },
  {
    value: "podcast",
    icon: "🎙️",
    label: "Podcast",
    description: "Professional podcast recording setup.",
  },
  {
    value: "office",
    icon: "🏢",
    label: "Office",
    description: "Professional workplace environment.",
  },
  {
    value: "home",
    icon: "🏠",
    label: "Home",
    description: "Natural and casual home environment.",
  },
  {
    value: "outdoor",
    icon: "🌤️",
    label: "Outdoor",
    description: "Natural outdoor filming environment.",
  },
  {
    value: "classroom",
    icon: "📚",
    label: "Classroom",
    description: "Educational and presentation-focused setup.",
  },
  {
    value: "product_demo",
    icon: "📦",
    label: "Product Demo",
    description: "Product-focused setup for demonstrations.",
  },
  {
    value: "cinematic",
    icon: "🎞️",
    label: "Cinematic",
    description: "Film-style cinematic setup.",
  },
  {
    value: "custom",
    icon: "✏️",
    label: "Custom",
    description: "Describe the setup in your own words.",
  },
];

export const BACKGROUNDS: { value: Background; label: string }[] = [
  { value: "clean_studio", label: "Clean studio" },
  { value: "modern_office", label: "Modern office" },
  { value: "home_interior", label: "Home interior" },
  { value: "outdoor", label: "Outdoor" },
  { value: "classroom", label: "Classroom" },
  { value: "custom", label: "Custom" },
];

export const CAMERA_FRAMINGS: { value: CameraFraming; label: string }[] = [
  { value: "wide", label: "Wide shot" },
  { value: "medium", label: "Medium shot" },
  { value: "medium_close_up", label: "Medium close-up" },
  { value: "close_up", label: "Close-up" },
  { value: "over_the_shoulder", label: "Over-the-shoulder" },
  { value: "full_body", label: "Full body" },
];

export const CAMERA_ANGLES: { value: CameraAngle; label: string }[] = [
  { value: "eye_level", label: "Eye level" },
  { value: "low_angle", label: "Slight low angle" },
  { value: "high_angle", label: "Slight high angle" },
  { value: "over_the_shoulder", label: "Over-the-shoulder" },
];

export const CAMERA_MOVEMENTS: { value: CameraMovement; label: string }[] = [
  { value: "static", label: "Static" },
  { value: "slow_push_in", label: "Slow push-in" },
  { value: "slow_pull_out", label: "Slow pull-out" },
  { value: "handheld", label: "Subtle handheld" },
  { value: "pan", label: "Pan" },
  { value: "tracking", label: "Tracking" },
];

export const LIGHTINGS: { value: Lighting; label: string }[] = [
  { value: "natural", label: "Natural" },
  { value: "soft_studio", label: "Soft studio" },
  { value: "warm", label: "Warm" },
  { value: "cool", label: "Cool" },
  { value: "dramatic", label: "Dramatic" },
  { value: "high_key", label: "High-key" },
  { value: "low_key", label: "Low-key" },
];

export const VISUAL_STYLES: { value: VisualStyle; label: string }[] = [
  { value: "realistic", label: "Realistic" },
  { value: "cinematic", label: "Cinematic" },
  { value: "documentary", label: "Documentary" },
  { value: "professional", label: "Professional" },
  { value: "social_media", label: "Social media" },
  { value: "commercial", label: "Commercial" },
  { value: "educational", label: "Educational" },
];

export const SUBJECTS: { value: Subject; label: string }[] = [
  { value: "creator", label: "Creator" },
  { value: "product", label: "Product" },
  { value: "people", label: "People" },
  { value: "environment", label: "Environment" },
  { value: "screen", label: "Screen / UI" },
];

export function presetLabel(preset: EnvironmentPreset): string {
  return ENVIRONMENT_PRESETS.find((p) => p.value === preset)?.label ?? preset;
}

export function presetDescription(preset: EnvironmentPreset): string {
  return ENVIRONMENT_PRESETS.find((p) => p.value === preset)?.description ?? "";
}

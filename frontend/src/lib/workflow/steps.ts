import type { ProjectStatus } from "@/types/project";

export const CREATE_STEPS = [
  { key: "idea", label: "Idea" },
  { key: "hooks", label: "Hooks" },
  { key: "script", label: "Script" },
  // No Language step. It existed to adapt an English script into Telugu or
  // Tenglish, back when the script agent always wrote English; the agent now
  // writes in the project's language directly, so the step had nothing left
  // to do. Language is picked in the header, on any step.
  { key: "storyboard", label: "Storyboard" },
  { key: "generate", label: "Generate" },
] as const;

export type CreateStepKey = (typeof CREATE_STEPS)[number]["key"];

export function stepIndex(key: CreateStepKey): number {
  return CREATE_STEPS.findIndex((s) => s.key === key);
}

const STATUS_TO_STEP: Record<ProjectStatus, CreateStepKey> = {
  draft: "hooks",
  hooks: "hooks",
  script: "script",
  // A project parked on the old Language step has finished its script; the
  // storyboard is what it owes next.
  tanglish: "storyboard",
  storyboard: "storyboard",
  generating: "generate",
  completed: "generate",
  failed: "generate",
};

export function nextStepForStatus(status: ProjectStatus): CreateStepKey {
  return STATUS_TO_STEP[status];
}

/**
 * How many steps the project has actually finished — which is not the same
 * as which step you are looking at. Opening /generate on a project that has
 * only reached the storyboard used to light the whole bar up to 100%, so the
 * stepper agreed the video was done while the page below it offered to start
 * generating one.
 */
export function completedStepCount(status: ProjectStatus): number {
  // Only a finished render completes the last step. "generating" and
  // "failed" both sit on it without having cleared it.
  if (status === "completed") return CREATE_STEPS.length;
  return stepIndex(STATUS_TO_STEP[status]);
}

/**
 * Where a step lives for an existing project, or null when it has nowhere to
 * go: "idea" is the /create page that brings a project into being, so it has
 * no per-project route, and a step the project has not reached yet would only
 * offer to generate something the previous step has not produced.
 */
export function stepHref(
  projectId: string,
  key: CreateStepKey,
  status: ProjectStatus
): string | null {
  if (key === "idea") return null;
  // The furthest finished step plus the one in progress: you can revisit
  // anything you have done, and re-enter the step you are on.
  if (stepIndex(key) > completedStepCount(status)) return null;
  return `/create/${projectId}/${key}`;
}

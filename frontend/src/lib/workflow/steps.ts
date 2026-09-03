import type { ProjectStatus } from "@/types/project";

export const CREATE_STEPS = [
  { key: "idea", label: "Idea" },
  { key: "hooks", label: "Hooks" },
  { key: "script", label: "Script" },
  { key: "tanglish", label: "Tanglish" },
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
  tanglish: "tanglish",
  storyboard: "storyboard",
  generating: "generate",
  completed: "generate",
  failed: "generate",
};

export function nextStepForStatus(status: ProjectStatus): CreateStepKey {
  return STATUS_TO_STEP[status];
}

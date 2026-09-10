import type { SceneEnvironment } from "@/types/environment";

export type StoryboardScene = {
  id: string;
  order: number;
  duration_seconds: number;
  voiceover: string;
  visual_prompt: string;
  caption: string;
  /** Creator is on camera. Costs several times a b-roll scene. */
  features_creator: boolean;
  /** How the scene is filmed. Always present; the server defaults it. */
  environment: SceneEnvironment;
  /** True once the creator has written the visual description themselves. */
  visual_is_custom: boolean;
};

export type Storyboard = {
  id: string;
  qa_passed: boolean;
  qa_issues: string[];
  scenes: StoryboardScene[];
};

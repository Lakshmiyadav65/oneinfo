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
  /** Which take the final video uses, when a run produced several. */
  selected_take: number;
  /** False for a scene the creator has left out of this cut. */
  included_in_video: boolean;
};

export type Storyboard = {
  id: string;
  qa_passed: boolean;
  qa_issues: string[];
  scenes: StoryboardScene[];
};

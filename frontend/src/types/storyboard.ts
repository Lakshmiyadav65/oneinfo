export type StoryboardScene = {
  id: string;
  order: number;
  duration_seconds: number;
  voiceover: string;
  visual_prompt: string;
  caption: string;
  /** Creator is on camera. Costs several times a b-roll scene. */
  features_creator: boolean;
};

export type Storyboard = {
  id: string;
  qa_passed: boolean;
  qa_issues: string[];
  scenes: StoryboardScene[];
};

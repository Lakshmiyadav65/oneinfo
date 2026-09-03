export type StoryboardScene = {
  id: string;
  order: number;
  duration_seconds: number;
  voiceover: string;
  visual_prompt: string;
  caption: string;
};

export type Storyboard = {
  id: string;
  qa_passed: boolean;
  qa_issues: string[];
  scenes: StoryboardScene[];
};

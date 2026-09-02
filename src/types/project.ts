export type ProjectStatus = "draft" | "processing" | "ready" | "failed";

export type ProjectSummary = {
  id: string;
  title: string;
  status: ProjectStatus;
  updatedAt: string;
  thumbnailUrl?: string | null;
};

export type ProjectDetail = ProjectSummary & {
  idea: string;
  videoUrl?: string | null;
};

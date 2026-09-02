import { api, ApiNotConfiguredError } from "@/lib/api/client";
import type { ProjectDetail, ProjectSummary } from "@/types/project";

export async function listProjects(): Promise<ProjectSummary[]> {
  try {
    return await api.get<ProjectSummary[]>("/projects");
  } catch (err) {
    if (err instanceof ApiNotConfiguredError) return [];
    throw err;
  }
}

export async function getProject(projectId: string): Promise<ProjectDetail | null> {
  try {
    return await api.get<ProjectDetail>(`/projects/${projectId}`);
  } catch (err) {
    if (err instanceof ApiNotConfiguredError) return null;
    throw err;
  }
}

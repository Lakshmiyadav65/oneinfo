import { api, ApiError, ApiNotConfiguredError } from "@/lib/api/client";
import type { IdeaSuggestions, Project, ProjectLanguage } from "@/types/project";

export async function listProjects(): Promise<Project[]> {
  try {
    return await api.get<Project[]>("/projects");
  } catch (err) {
    if (err instanceof ApiNotConfiguredError) return [];
    throw err;
  }
}

export async function getProject(projectId: string): Promise<Project | null> {
  try {
    return await api.get<Project>(`/projects/${projectId}`);
  } catch (err) {
    if (err instanceof ApiNotConfiguredError) return null;
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function createProject(
  idea: string,
  title?: string,
  language: ProjectLanguage = "english"
): Promise<Project> {
  return api.post<Project>("/projects", { idea, title: title || undefined, language });
}

/** Ideas for a creator with an empty Idea box. Creates no project. */
export function suggestIdeas(language: ProjectLanguage): Promise<IdeaSuggestions> {
  return api.post<IdeaSuggestions>("/projects/idea-suggestions", { language });
}

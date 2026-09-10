import type { SceneEnvironment } from "@/types/environment";
import type { OutputSettings } from "@/types/output-settings";
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
  language?: ProjectLanguage
): Promise<Project> {
  // Language omitted rather than defaulted, the same way suggestIdeas does
  // it: the create screen no longer asks, and defaulting to "english" here
  // overrode the server's carry-over from the creator's last project.
  return api.post<Project>("/projects", { idea, title: title || undefined, language });
}

/** Ideas for a creator with an empty Idea box. Creates no project. */
export function suggestIdeas(language?: ProjectLanguage): Promise<IdeaSuggestions> {
  // Omitted rather than defaulted here: the server already has a value, and
  // picking one in the client would put a second default in play.
  return api.post<IdeaSuggestions>("/projects/idea-suggestions", { language });
}

/**
 * Changes the language later steps generate in. Existing hooks and scripts
 * are left as they are — see project_service.update_language.
 */
export function updateProjectLanguage(
  projectId: string,
  language: ProjectLanguage
): Promise<Project> {
  return api.patch<Project>(`/projects/${projectId}`, { language });
}

/**
 * The setup new scenes inherit. `applyToAll` also rewrites existing scenes,
 * leaving alone any whose visual description the creator wrote by hand.
 */
export async function setProjectEnvironment(
  projectId: string,
  environment: SceneEnvironment,
  options: { applyToAll?: boolean; resetToPreset?: boolean } = {}
): Promise<Project> {
  return api.patch<Project>(`/projects/${projectId}/environment`, {
    environment,
    apply_to_all: options.applyToAll ?? false,
    reset_to_preset: options.resetToPreset ?? false,
  });
}

/**
 * Changes what this project generates at. Nothing already generated is
 * re-rendered — see project_service.set_output_settings.
 */
export function setOutputSettings(
  projectId: string,
  output: OutputSettings
): Promise<Project> {
  return api.patch<Project>(`/projects/${projectId}/output-settings`, output);
}

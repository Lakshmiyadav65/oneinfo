import { api, ApiError } from "@/lib/api/client";
import type { Storyboard } from "@/types/storyboard";

export async function getStoryboard(projectId: string): Promise<Storyboard | null> {
  try {
    return await api.get<Storyboard>(`/projects/${projectId}/storyboard`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// Backend has a single /generate endpoint that also serves as regenerate.
export async function generateStoryboard(projectId: string): Promise<Storyboard> {
  return api.post<Storyboard>(`/projects/${projectId}/storyboard/generate`);
}

export async function setSceneOnCamera(
  projectId: string,
  sceneId: string,
  featuresCreator: boolean
): Promise<Storyboard> {
  return api.patch<Storyboard>(
    `/projects/${projectId}/storyboard/scenes/${sceneId}`,
    { features_creator: featuresCreator }
  );
}

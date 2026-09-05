import { api, ApiError } from "@/lib/api/client";
import type { GenerationJob, VideoOutput } from "@/types/generation";

export async function startGeneration(projectId: string): Promise<GenerationJob> {
  return api.post<GenerationJob>(`/projects/${projectId}/generate`);
}

export async function getGenerationStatus(projectId: string): Promise<GenerationJob | null> {
  try {
    return await api.get<GenerationJob>(`/projects/${projectId}/generation`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function getOutput(projectId: string): Promise<VideoOutput | null> {
  try {
    return await api.get<VideoOutput>(`/projects/${projectId}/output`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * In local-storage dev mode, `output.url` is a relative, auth-gated proxy
 * route (`/projects/{id}/output/file`) — a plain <video src> can't attach
 * the Authorization header, so it 401s. Fetch it through the authenticated
 * client instead and hand back an object URL. A real StorageProvider (GCS)
 * returns an absolute signed URL that's safe to use directly.
 */
export async function getPlayableOutputUrl(output: VideoOutput): Promise<string> {
  if (output.url.startsWith("http")) return output.url;
  const blob = await api.getBlob(output.url);
  return URL.createObjectURL(blob);
}

/** Renders one scene on its own, so it can be checked before paying for the rest. */
export async function generateScene(
  projectId: string,
  sceneId: string
): Promise<GenerationJob> {
  return api.post<GenerationJob>(
    `/projects/${projectId}/storyboard/scenes/${sceneId}/generate`
  );
}

export async function getSceneClip(projectId: string, sceneId: string): Promise<Blob> {
  return api.getBlob(`/projects/${projectId}/scenes/${sceneId}/file`);
}

import { api, ApiError } from "@/lib/api/client";
import type { ExportFormat, GenerationJob, VideoOutput } from "@/types/generation";
import type { Resolution } from "@/types/output-settings";

export async function startGeneration(projectId: string): Promise<GenerationJob> {
  return api.post<GenerationJob>(`/projects/${projectId}/generate`);
}

/**
 * The finished video again, framed for wherever it is going next.
 *
 * The same free stitch as combining - the clips have already been paid for
 * and nothing reaches the video provider - so exporting one cut for three
 * platforms costs nothing.
 */
export async function exportVideo(
  projectId: string,
  format: ExportFormat,
  resolution: Resolution
): Promise<GenerationJob> {
  return api.post<GenerationJob>(`/projects/${projectId}/export`, {
    format,
    resolution,
  });
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

export async function getSceneClip(
  projectId: string,
  sceneId: string,
  /** One of several takes. Omitted, the server serves the one in use. */
  take?: number
): Promise<Blob> {
  const suffix = take === undefined ? "" : `?take=${take}`;
  return api.getBlob(`/projects/${projectId}/scenes/${sceneId}/file${suffix}`);
}

/** One clip on hand for a scene. */
export type SceneTake = {
  take_index: number;
  /**
   * The run that produced it. Clips sharing this came out of one
   * generation; a different id is the attempt that replaced them, which is
   * the comparison the creator is making. Null on clips generated before
   * runs were recorded.
   */
  generation_job_id: string | null;
  created_at: string;
};

/**
 * A list, not a count. Take indices count up across runs and old runs are
 * dropped, so a scene on its second run holds takes 1 and 2 - inferring
 * 0..n-1 would offer a deleted clip and hide a real one.
 */
export type SceneTakes = { takes: SceneTake[]; selected_take: number };

export function getSceneTakes(projectId: string, sceneId: string): Promise<SceneTakes> {
  return api.get<SceneTakes>(`/projects/${projectId}/scenes/${sceneId}/takes`);
}

/**
 * Picks the take this scene contributes to the final video. Costs nothing
 * and is reversible: the finished video is only rebuilt on request.
 */
export function selectSceneTake(
  projectId: string,
  sceneId: string,
  take: number
): Promise<SceneTakes> {
  return api.post<SceneTakes>(`/projects/${projectId}/scenes/${sceneId}/takes/${take}`, {});
}

export type StitchReadiness = {
  scenes_total: number;
  scenes_ready: number;
  /** Scene numbers with no clip yet. Empty means combining is available. */
  missing_scenes: number[];
};

export function getStitchReadiness(projectId: string): Promise<StitchReadiness> {
  return api.get<StitchReadiness>(`/projects/${projectId}/stitch`);
}

/**
 * Combines the clips already generated into the finished video. Calls the
 * video provider zero times, so it costs nothing.
 */
export function startStitch(projectId: string): Promise<GenerationJob> {
  return api.post<GenerationJob>(`/projects/${projectId}/stitch`, {});
}


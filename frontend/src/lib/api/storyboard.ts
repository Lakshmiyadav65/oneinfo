import { api, ApiError } from "@/lib/api/client";
import type { Storyboard } from "@/types/storyboard";
import type { SceneEnvironment } from "@/types/environment";

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

/**
 * Replaces one scene's filming setup.
 *
 * `resetToPreset` says the creator clicked a preset chip rather than nudging
 * one control, so the server rebuilds the rest from that preset's defaults —
 * which is why "what YouTube Studio means" is not duplicated here.
 *
 * `rebuildVisual` decides what happens to a visual description the creator
 * wrote themselves. False keeps their words.
 */
export async function setSceneEnvironment(
  projectId: string,
  sceneId: string,
  environment: SceneEnvironment,
  options: { resetToPreset?: boolean; rebuildVisual?: boolean } = {}
): Promise<Storyboard> {
  return api.patch<Storyboard>(
    `/projects/${projectId}/storyboard/scenes/${sceneId}/environment`,
    {
      environment,
      reset_to_preset: options.resetToPreset ?? false,
      rebuild_visual: options.rebuildVisual ?? true,
    }
  );
}

/** The creator's own wording for the shot. Nothing rebuilds over it after. */
export async function setSceneVisual(
  projectId: string,
  sceneId: string,
  visualPrompt: string
): Promise<Storyboard> {
  return api.patch<Storyboard>(
    `/projects/${projectId}/storyboard/scenes/${sceneId}/visual`,
    { visual_prompt: visualPrompt }
  );
}

/**
 * Leaves a scene out of the finished video, or puts it back. The scene and
 * any clip it already has are kept, so this is free and reversible.
 */
export function setSceneInclusion(
  projectId: string,
  sceneId: string,
  includedInVideo: boolean
): Promise<Storyboard> {
  return api.patch<Storyboard>(
    `/projects/${projectId}/storyboard/scenes/${sceneId}/inclusion`,
    { included_in_video: includedInVideo }
  );
}


/**
 * How long this one clip runs. Null goes back to fitting the dialogue.
 *
 * Only 4, 6 and 8 second clips exist, and only 8 while the creator is on
 * camera. The server refuses anything else rather than letting Veo reject
 * it mid-run, by which point earlier scenes have already been billed.
 */
export function setSceneDuration(
  projectId: string,
  sceneId: string,
  durationSeconds: number | null
): Promise<Storyboard> {
  return api.patch<Storyboard>(
    `/projects/${projectId}/storyboard/scenes/${sceneId}/duration`,
    { duration_seconds: durationSeconds }
  );
}


/**
 * Rewrites what one scene says.
 *
 * The clip length and the prompt both follow the new words on the server,
 * so this is the only thing sent. Saving does not regenerate anything: the
 * clips already made are kept, marked as older than the line, and it is the
 * creator who decides which of them to replace.
 */
export function setSceneDialogue(
  projectId: string,
  sceneId: string,
  voiceover: string
): Promise<Storyboard> {
  return api.patch<Storyboard>(
    `/projects/${projectId}/storyboard/scenes/${sceneId}/dialogue`,
    { voiceover }
  );
}

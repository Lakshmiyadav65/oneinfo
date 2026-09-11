import { api, ApiNotConfiguredError } from "@/lib/api/client";
import type { CreatorFaceImage, FaceSetup } from "@/types/creator-face";
import type { ConfirmedAngle } from "@/types/creator-recording";

const EMPTY: FaceSetup = {
  images: [],
  max_images: 3,
  consent_granted: false,
  consent_at: null,
  appearance_description: null,
  voice_description: null,
  recording: null,
  ready_for_generation: false,
};

export async function getFaceSetup(): Promise<FaceSetup> {
  try {
    return await api.get<FaceSetup>("/creators/me/face");
  } catch (err) {
    if (err instanceof ApiNotConfiguredError) return EMPTY;
    throw err;
  }
}

export async function uploadFaceImage(file: File): Promise<CreatorFaceImage> {
  const form = new FormData();
  form.append("file", file);
  return api.postForm<CreatorFaceImage>("/creators/me/face", form);
}

export async function deleteFaceImage(faceId: string): Promise<void> {
  await api.delete<void>(`/creators/me/face/${faceId}`);
}

export async function grantFaceConsent(): Promise<FaceSetup> {
  return api.post<FaceSetup>("/creators/me/face/consent");
}

export async function revokeFaceConsent(): Promise<FaceSetup> {
  return api.delete<FaceSetup>("/creators/me/face/consent");
}

export async function updateFaceDescriptions(payload: {
  appearance_description?: string | null;
  voice_description?: string | null;
}): Promise<FaceSetup> {
  return api.patch<FaceSetup>("/creators/me/face/descriptions", payload);
}

/**
 * Sends one capture: the take, the three frames the session confirmed from
 * it, and where each angle was measured.
 *
 * The frames are grabbed in the browser at the instant the turn was
 * measured, not cut from the take afterwards. A WebM out of MediaRecorder
 * has sparse keyframes, so seeking it lands near the moment rather than on
 * it — and catching an exact one is the whole reason for tracking the head.
 */
export async function uploadAvatarCapture(payload: {
  take: Blob;
  frames: Blob[];
  angles: ConfirmedAngle[];
}): Promise<FaceSetup> {
  const form = new FormData();
  const extension = payload.take.type.includes("mp4") ? "mp4" : "webm";
  form.append("file", payload.take, `capture.${extension}`);
  payload.frames.forEach((frame, index) => {
    form.append("frames", frame, `${payload.angles[index]?.angle ?? index}.jpg`);
  });
  form.append("angles", JSON.stringify(payload.angles));
  return api.postForm<FaceSetup>("/creators/me/face/capture", form);
}

/**
 * Re-cuts the reference frames from the capture already on file. Passing no
 * angles re-cuts at the moments the session originally measured.
 */
export async function reextractFrames(angles?: ConfirmedAngle[]): Promise<FaceSetup> {
  return api.post<FaceSetup>("/creators/me/face/recording/reextract", {
    angles: angles ?? null,
  });
}

/** Deletes the capture and keeps the frames cut from it. */
export async function deleteAvatarRecording(): Promise<FaceSetup> {
  return api.delete<FaceSetup>("/creators/me/face/recording");
}

import { api, ApiNotConfiguredError } from "@/lib/api/client";
import type { CreatorFaceImage, FaceSetup } from "@/types/creator-face";

const EMPTY: FaceSetup = {
  images: [],
  max_images: 3,
  consent_granted: false,
  consent_at: null,
  appearance_description: null,
  voice_description: null,
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

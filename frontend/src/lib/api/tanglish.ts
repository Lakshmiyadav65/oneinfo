import { api, ApiError } from "@/lib/api/client";
import type { LocalizedLanguage, Tanglish } from "@/types/tanglish";

export async function getTanglish(projectId: string): Promise<Tanglish | null> {
  try {
    return await api.get<Tanglish>(`/projects/${projectId}/tanglish`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// Backend has a single /generate endpoint that also serves as regenerate.
export async function generateTanglish(
  projectId: string,
  language: LocalizedLanguage,
): Promise<Tanglish> {
  return api.post<Tanglish>(`/projects/${projectId}/tanglish/generate`, { language });
}

export async function updateTanglish(projectId: string, content: string): Promise<Tanglish> {
  return api.patch<Tanglish>(`/projects/${projectId}/tanglish`, { content });
}

export async function approveTanglish(projectId: string): Promise<Tanglish> {
  return api.post<Tanglish>(`/projects/${projectId}/tanglish/approve`);
}

import { api, ApiError } from "@/lib/api/client";
import type { Script } from "@/types/script";

export async function getScript(projectId: string): Promise<Script | null> {
  try {
    return await api.get<Script>(`/projects/${projectId}/script`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function generateScript(projectId: string): Promise<Script> {
  return api.post<Script>(`/projects/${projectId}/script/generate`);
}

export async function regenerateScript(projectId: string): Promise<Script> {
  return api.post<Script>(`/projects/${projectId}/script/regenerate`);
}

export async function updateScript(
  projectId: string,
  content: string,
  title?: string
): Promise<Script> {
  return api.patch<Script>(`/projects/${projectId}/script`, { content, title });
}

export async function approveScript(projectId: string): Promise<Script> {
  return api.post<Script>(`/projects/${projectId}/script/approve`);
}

import { api } from "@/lib/api/client";
import type { Hook } from "@/types/hook";

export async function listHooks(projectId: string): Promise<Hook[]> {
  return api.get<Hook[]>(`/projects/${projectId}/hooks`);
}

export async function generateHooks(projectId: string): Promise<Hook[]> {
  return api.post<Hook[]>(`/projects/${projectId}/hooks/generate`);
}

export async function regenerateHooks(projectId: string): Promise<Hook[]> {
  return api.post<Hook[]>(`/projects/${projectId}/hooks/regenerate`);
}

export async function selectHook(projectId: string, hookId: string): Promise<Hook> {
  return api.post<Hook>(`/projects/${projectId}/hooks/${hookId}/select`);
}

/** Files a hook the creator wrote themselves alongside the generated ones. */
export function addCustomHook(projectId: string, text: string): Promise<Hook> {
  return api.post<Hook>(`/projects/${projectId}/hooks`, { text });
}

import { api, ApiNotConfiguredError } from "@/lib/api/client";
import type { KnowledgeItem, KnowledgeStructureResult, KnowledgeSection } from "@/types/knowledge";

export async function listKnowledge(): Promise<KnowledgeItem[]> {
  try {
    return await api.get<KnowledgeItem[]>("/knowledge");
  } catch (err) {
    if (err instanceof ApiNotConfiguredError) return [];
    throw err;
  }
}

/**
 * Asks the backend to split a raw paste into topic-separated documents.
 * Saves nothing — the creator reviews the proposal before it is committed.
 */
export function structureKnowledge(content: string): Promise<KnowledgeStructureResult> {
  return api.post<KnowledgeStructureResult>("/knowledge/structure", { content });
}

/**
 * Commits reviewed sections as separate documents. Only title and content
 * are sent — `parts` is the display breakdown of that same content, so
 * posting it too would ship every section's text twice.
 */
export function saveKnowledgeSections(documents: KnowledgeSection[]): Promise<KnowledgeItem[]> {
  return api.post<KnowledgeItem[]>("/knowledge/bulk", {
    documents: documents.map(({ title, content }) => ({ title, content })),
  });
}

export function addKnowledgeText(title: string, content: string): Promise<KnowledgeItem> {
  return api.post<KnowledgeItem>("/knowledge/text", { title, content });
}

export function uploadKnowledgeFile(file: File): Promise<KnowledgeItem> {
  const form = new FormData();
  form.append("file", file);
  return api.postForm<KnowledgeItem>("/knowledge/upload", form);
}

export function deleteKnowledge(id: string): Promise<void> {
  return api.delete<void>(`/knowledge/${id}`);
}

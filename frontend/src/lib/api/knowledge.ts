import { api, ApiNotConfiguredError } from "@/lib/api/client";
import type {
  KnowledgeDetail,
  KnowledgeItem,
  KnowledgeStructureResult,
  KnowledgeSection,
  ReelQueued,
} from "@/types/knowledge";
import type { ProjectLanguage } from "@/types/project";

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

/**
 * Queues a batch of reel links for transcription. Resolves as soon as they
 * are filed — every document comes back "processing", and the list polls
 * until they are ready.
 */
export async function addKnowledgeReels(
  urls: string[],
  language: ProjectLanguage
): Promise<{ reels: ReelQueued[] }> {
  return api.post<{ reels: ReelQueued[] }>("/knowledge/reels", { urls, language });
}

/** The same, for a video file — the reel Instagram will not hand over. */
export function uploadKnowledgeVideo(
  file: File,
  language: ProjectLanguage
): Promise<KnowledgeItem> {
  const form = new FormData();
  form.append("file", file);
  form.append("language", language);
  return api.postForm<KnowledgeItem>("/knowledge/video", form);
}

/** What one document says. Read back out of the chunks retrieval searches. */
export function getKnowledge(id: string): Promise<KnowledgeDetail> {
  return api.get<KnowledgeDetail>(`/knowledge/${id}`);
}

/**
 * Saves a correction. Comes back "processing" — the text is stored at once,
 * and the re-chunking that makes it findable happens after the response.
 */
export function updateKnowledgeContent(id: string, content: string): Promise<KnowledgeItem> {
  return api.patch<KnowledgeItem>(`/knowledge/${id}`, { content });
}

/** Reads the same reel again in another language. Links only. */
export function retranscribeKnowledge(
  id: string,
  language: ProjectLanguage
): Promise<KnowledgeItem> {
  return api.post<KnowledgeItem>(`/knowledge/${id}/retranscribe`, { language });
}

export function deleteKnowledge(id: string): Promise<void> {
  return api.delete<void>(`/knowledge/${id}`);
}

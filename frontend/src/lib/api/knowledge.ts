import { api, ApiNotConfiguredError } from "@/lib/api/client";
import type { KnowledgeItem } from "@/types/knowledge";

export async function listKnowledge(): Promise<KnowledgeItem[]> {
  try {
    return await api.get<KnowledgeItem[]>("/knowledge");
  } catch (err) {
    if (err instanceof ApiNotConfiguredError) return [];
    throw err;
  }
}

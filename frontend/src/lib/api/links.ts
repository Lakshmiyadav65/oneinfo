import { api } from "@/lib/api/client";
import type { LinkRead } from "@/types/link";

/**
 * Finds web addresses in whatever the creator typed.
 *
 * Deliberately loose about what precedes a URL and strict about what follows
 * it: people paste links mid-sentence, and trailing punctuation belongs to
 * the sentence rather than the address.
 */
export function findUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  const cleaned = matches.map((url) => url.replace(/[.,;:!?)\]}]+$/, ""));
  return Array.from(new Set(cleaned));
}

export async function readLinks(
  urls: string[],
  saveToKnowledge = true
): Promise<LinkRead[]> {
  const result = await api.post<{ pages: LinkRead[] }>("/links/read", {
    urls,
    save_to_knowledge: saveToKnowledge,
  });
  return result.pages;
}

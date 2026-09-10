import { api, ApiNotConfiguredError } from "@/lib/api/client";
import type { MediaItem, MediaKind } from "@/types/media";

export async function listMedia(kind?: MediaKind): Promise<MediaItem[]> {
  const suffix = kind ? `?kind=${kind}` : "";
  try {
    return await api.get<MediaItem[]>(`/media${suffix}`);
  } catch (err) {
    // Same as the knowledge list: a missing backend leaves the page empty
    // rather than replacing it with an error nobody can act on.
    if (err instanceof ApiNotConfiguredError) return [];
    throw err;
  }
}

/**
 * The file itself, as an object URL.
 *
 * Fetched through the authenticated client rather than handed to a <video
 * src>, because the route is auth-gated and a plain src attribute cannot
 * attach the Authorization header.
 */
export async function getMediaObjectUrl(item: MediaItem): Promise<string> {
  const blob = await api.getBlob(item.url);
  return URL.createObjectURL(blob);
}

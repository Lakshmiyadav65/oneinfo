/**
 * Turning a title into something safe to save to disk.
 *
 * Marks are kept alongside letters and digits: Telugu vowel signs are marks,
 * not letters, and dropping them turned "తెలుగు" into "త-ల-గ" - a filename
 * that is no longer the word it came from.
 *
 * Shared rather than duplicated, so that lesson lives in one place: a video
 * export and a poster download both land in the same downloads folder and
 * should be legible there a week later.
 */
export function downloadSlug(title: string, fallback: string): string {
  return (
    title
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || fallback
  );
}

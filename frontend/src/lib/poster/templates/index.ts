/**
 * Every template, in one plain object.
 *
 * Not a Map filled by import side effects, which fails here in three separate
 * ways: a bundler is free to drop a module whose only purpose is a side
 * effect, Fast Refresh re-runs registration and registers twice, and the id
 * union ends up maintained by hand next to the map and drifts from it. An
 * object literal checked with `satisfies` keeps the compiler on the hook for
 * all three.
 *
 * Every template is in the bundle, deliberately. Lazy-loading six small draw
 * functions would mean showing a blank frame while a chunk streams in, which
 * is the one thing this feature cannot do - the preview is the product.
 */

import type { PosterTemplateId } from "@/types/poster";
import type { PosterTemplate } from "@/lib/poster/template";
import { offerSlab } from "@/lib/poster/templates/offer-slab";
import { festivalOffer } from "@/lib/poster/templates/festival-offer";
import { festivalPanel } from "@/lib/poster/templates/festival-panel";
import { announcementClean } from "@/lib/poster/templates/announcement-clean";

export const POSTER_TEMPLATES = {
  "offer-slab": offerSlab,
  "festival-offer": festivalOffer,
  "festival-panel": festivalPanel,
  "announcement-clean": announcementClean,
} satisfies Record<PosterTemplateId, PosterTemplate>;

export const DEFAULT_TEMPLATE_ID: PosterTemplateId = "offer-slab";

/** Never throws: an unknown id falls back rather than blanking the preview. */
export function templateFor(id: PosterTemplateId): PosterTemplate {
  return POSTER_TEMPLATES[id] ?? POSTER_TEMPLATES[DEFAULT_TEMPLATE_ID];
}

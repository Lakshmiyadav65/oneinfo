/**
 * News, set left.
 *
 * New timings, a new branch, a new item on the menu. These are sentences
 * rather than slogans, so this is the one template that sets its text ranged
 * left - centred text stops being readable the moment it runs past two lines,
 * and an announcement usually does.
 *
 * The offer still has a place here, just a smaller one: a shop announcing
 * something new very often attaches an opening discount to it.
 */

import { band, safeBox, type PosterFrame, type PosterRegions } from "@/lib/poster/frame";
import type { PosterSize } from "@/types/poster";
import type { PosterScene, PosterTemplate } from "@/lib/poster/template";
import { drawBlock, drawBrandBar, drawCtaPill, drawOfferSlab, drawTerms } from "@/lib/poster/templates/parts";

function regions(frame: PosterFrame, size: PosterSize): PosterRegions {
  const safe = safeBox(frame, size);
  return {
    safe,
    headline: band(safe, 0.04, 0.36),
    subline: band(safe, 0.38, 0.55),
    // Narrower than full width: an announcement's offer is a supporting badge,
    // not the headline act.
    offer: { ...band(safe, 0.56, 0.70), width: safe.width * 0.56 },
    terms: band(safe, 0.71, 0.755),
    cta: band(safe, 0.775, 0.845),
    brandBar: band(safe, 0.875, 1),
    art: band(safe, 0, 0),
  };
}

function draw(ctx: CanvasRenderingContext2D, scene: PosterScene): void {
  const { design, style, regions: r, frame } = scene;

  const headline = drawBlock(ctx, scene, "headline", {
    text: design.content.headline,
    box: r.headline,
    family: style.display,
    weight: style.headlineWeight,
    size: Math.round(frame.width * 0.095),
    minSize: Math.round(frame.width * 0.045),
    lineHeight: 1.08,
    align: "left",
    vAlign: "bottom",
    color: style.ink,
    maxLines: 3,
  });

  if (design.content.subline.trim()) {
    drawBlock(ctx, scene, "subline", {
      // Flowed under whatever the headline actually took, rather than pinned
      // to a fixed y that a three-line headline would overlap.
      box: {
        x: r.subline.x,
        y: Math.max(r.subline.y, headline.bounds.y + headline.bounds.height + frame.height * 0.02),
        width: r.subline.width,
        height: r.subline.height,
      },
      text: design.content.subline,
      family: style.body,
      weight: style.bodyWeight,
      size: Math.round(frame.width * 0.042),
      minSize: Math.round(frame.width * 0.026),
      lineHeight: 1.26,
      align: "left",
      vAlign: "top",
      color: style.inkMuted,
      maxLines: 4,
    });
  }

  drawOfferSlab(ctx, scene, r.offer);

  drawTerms(ctx, scene, { ...r.terms, x: r.safe.x, width: r.safe.width });

  drawCtaPill(ctx, scene, r.cta);
  drawBrandBar(ctx, scene, r.brandBar, { panel: true });
}

export const announcementClean: PosterTemplate = {
  id: "announcement-clean",
  label: "Announcement",
  regions,
  draw,
};

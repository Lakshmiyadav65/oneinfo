/**
 * The offer is the poster.
 *
 * One enormous number in the middle and everything else deliberately small,
 * because this is read at thumbnail size in a WhatsApp list before anyone
 * decides to open it. If the discount is not legible at 120px wide, the poster
 * has failed regardless of how good the rest of it looks.
 */

import { band, type Box, type PosterFrame, type PosterRegions } from "@/lib/poster/frame";
import type { PosterScene, PosterTemplate } from "@/lib/poster/template";
import { drawBlock, drawBrandBar, drawCtaPill, drawOfferSlab, drawTerms } from "@/lib/poster/templates/parts";

function regions(_frame: PosterFrame, safe: Box): PosterRegions {
  return {
    safe,
    headline: band(safe, 0, 0.14),
    offer: band(safe, 0.16, 0.53),
    subline: band(safe, 0.55, 0.645),
    terms: band(safe, 0.655, 0.70),
    cta: band(safe, 0.725, 0.795),
    brandBar: band(safe, 0.835, 1),
    art: band(safe, 0, 0),
  };
}

function draw(ctx: CanvasRenderingContext2D, scene: PosterScene): void {
  const { design, style, regions: r, frame } = scene;

  if (design.content.headline.trim()) {
    drawBlock(ctx, scene, "headline", {
      text: design.content.headline,
      box: r.headline,
      family: style.display,
      weight: style.headlineWeight,
      size: Math.round(frame.width * 0.075),
      minSize: Math.round(frame.width * 0.04),
      lineHeight: 1.1,
      align: "center",
      vAlign: "middle",
      color: style.ink,
      maxLines: 2,
      transform: "upper",
    });
  }

  drawOfferSlab(ctx, scene, r.offer);

  if (design.content.subline.trim()) {
    drawBlock(ctx, scene, "subline", {
      text: design.content.subline,
      box: r.subline,
      family: style.body,
      weight: style.bodyWeight,
      size: Math.round(frame.width * 0.042),
      minSize: Math.round(frame.width * 0.026),
      lineHeight: 1.22,
      align: "center",
      vAlign: "top",
      color: style.ink,
      maxLines: 3,
    });
  }

  drawTerms(ctx, scene, r.terms);

  drawCtaPill(ctx, scene, r.cta);
  drawBrandBar(ctx, scene, r.brandBar, { panel: true });
}

export const offerSlab: PosterTemplate = {
  id: "offer-slab",
  label: "Offer",
  regions,
  draw,
};

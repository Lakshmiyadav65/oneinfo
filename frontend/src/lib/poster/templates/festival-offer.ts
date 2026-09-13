/**
 * A festival wrapped around an offer - the combination this module exists for.
 *
 * A shop does not post on Ganesh Chaturthi to send good wishes; it posts
 * because the festival is why someone might come in this week. So the greeting
 * gets the top third at real size, and the offer sits directly under it on its
 * own slab. Neither is decoration for the other.
 *
 * With no offer filled in, this falls through to the greeting layout rather
 * than leaving a hole - which is why `offerBig` being empty is a documented
 * part of the design rather than an invalid state.
 */

import { band, roundRectPath, safeBox, type PosterFrame, type PosterRegions } from "@/lib/poster/frame";
import type { PosterSize } from "@/types/poster";
import type { PosterScene, PosterTemplate } from "@/lib/poster/template";
import { drawBlock, drawBrandBar, drawCtaPill, drawOfferSlab, drawTerms } from "@/lib/poster/templates/parts";

function regions(frame: PosterFrame, size: PosterSize): PosterRegions {
  const safe = safeBox(frame, size);
  return {
    safe,
    headline: band(safe, 0, 0.25),
    offer: band(safe, 0.28, 0.575),
    subline: band(safe, 0.595, 0.675),
    terms: band(safe, 0.685, 0.73),
    cta: band(safe, 0.755, 0.825),
    brandBar: band(safe, 0.855, 1),
    art: band(safe, 0, 0),
  };
}

function draw(ctx: CanvasRenderingContext2D, scene: PosterScene): void {
  const { design, style, regions: r, frame } = scene;
  const hasOfferSlab = design.content.offerBig.trim().length > 0;

  // With nothing to put on a slab, the greeting takes the space the offer
  // would have had rather than floating above an empty band.
  const headlineBox = hasOfferSlab ? r.headline : band(r.safe, 0.04, 0.5);

  drawBlock(ctx, scene, "headline", {
    text: design.content.headline,
    box: headlineBox,
    family: style.display,
    weight: style.headlineWeight,
    size: Math.round(frame.width * (hasOfferSlab ? 0.105 : 0.135)),
    minSize: Math.round(frame.width * 0.05),
    lineHeight: 1.08,
    align: "center",
    vAlign: "middle",
    color: style.ink,
    maxLines: 3,
  });

  // A thin rule under the greeting, so the eye reads it as a heading over the
  // offer rather than as one stack of unrelated lines.
  if (hasOfferSlab) {
    const ruleWidth = r.safe.width * 0.22;
    ctx.save();
    ctx.fillStyle = style.accent;
    roundRectPath(
      ctx,
      {
        x: r.safe.x + (r.safe.width - ruleWidth) / 2,
        y: r.headline.y + r.headline.height + frame.height * 0.005,
        width: ruleWidth,
        height: Math.max(4, frame.height * 0.005),
      },
      99
    );
    ctx.fill();
    ctx.restore();

    drawOfferSlab(ctx, scene, r.offer);
  }

  if (design.content.subline.trim()) {
    drawBlock(ctx, scene, "subline", {
      text: design.content.subline,
      box: hasOfferSlab ? r.subline : band(r.safe, 0.52, 0.66),
      family: style.body,
      weight: style.bodyWeight,
      size: Math.round(frame.width * 0.04),
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

export const festivalOffer: PosterTemplate = {
  id: "festival-offer",
  label: "Festival offer",
  regions,
  draw,
};

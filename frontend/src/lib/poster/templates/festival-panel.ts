/**
 * A greeting, with nothing to sell.
 *
 * Some posts genuinely are just good wishes - Independence Day, a condolence,
 * a thank you - and putting a discount on those reads badly. So this template
 * has no offer slab at all rather than an empty one.
 */

import { band, roundRectPath, type Box, type PosterFrame, type PosterRegions } from "@/lib/poster/frame";
import type { PosterScene, PosterTemplate } from "@/lib/poster/template";
import { drawBlock, drawBrandBar, drawCtaPill } from "@/lib/poster/templates/parts";

function regions(_frame: PosterFrame, safe: Box): PosterRegions {
  return {
    safe,
    headline: band(safe, 0.08, 0.46),
    subline: band(safe, 0.5, 0.66),
    offer: band(safe, 0, 0),
    terms: band(safe, 0, 0),
    cta: band(safe, 0.72, 0.79),
    brandBar: band(safe, 0.84, 1),
    art: band(safe, 0, 0),
  };
}

function draw(ctx: CanvasRenderingContext2D, scene: PosterScene): void {
  const { design, style, regions: r, frame } = scene;

  drawBlock(ctx, scene, "headline", {
    text: design.content.headline,
    box: r.headline,
    family: style.display,
    weight: style.headlineWeight,
    size: Math.round(frame.width * 0.13),
    minSize: Math.round(frame.width * 0.05),
    lineHeight: 1.06,
    align: "center",
    vAlign: "middle",
    color: style.ink,
    maxLines: 3,
  });

  const ruleWidth = r.safe.width * 0.18;
  ctx.save();
  ctx.fillStyle = style.accent;
  roundRectPath(
    ctx,
    {
      x: r.safe.x + (r.safe.width - ruleWidth) / 2,
      y: r.headline.y + r.headline.height + frame.height * 0.012,
      width: ruleWidth,
      height: Math.max(4, frame.height * 0.005),
    },
    99
  );
  ctx.fill();
  ctx.restore();

  if (design.content.subline.trim()) {
    drawBlock(ctx, scene, "subline", {
      text: design.content.subline,
      box: r.subline,
      family: style.body,
      weight: style.bodyWeight,
      size: Math.round(frame.width * 0.045),
      minSize: Math.round(frame.width * 0.028),
      lineHeight: 1.24,
      align: "center",
      vAlign: "top",
      color: style.ink,
      maxLines: 3,
    });
  }

  drawCtaPill(ctx, scene, r.cta);
  drawBrandBar(ctx, scene, r.brandBar, { panel: true });
}

export const festivalPanel: PosterTemplate = {
  id: "festival-panel",
  label: "Greeting",
  regions,
  draw,
};

/**
 * One function draws the poster, and both the preview and the exported PNG go
 * through it. That is what makes "what you see is the file you download" true
 * by construction rather than by two implementations being kept in step.
 *
 * The design space IS the export size, so a template writes 88 and means 88
 * pixels in the final image. `scale` is the only thing that differs between
 * preview and export, it is applied once here, and no template ever sees it.
 *
 * This file touches no React and no `window`: fonts arrive already resolved to
 * a family string, images arrive already decoded. Keeping that true costs one
 * extra field on the target and leaves a server-side render open later.
 */

import type { PosterDesign } from "@/types/poster";
import type { PosterAssets } from "@/lib/poster/images";
import { paintBackground } from "@/lib/poster/background";
import { decorInsets, paintDecor, shrinkForDecor } from "@/lib/poster/decor";
import { safeBox } from "@/lib/poster/frame";
import { resetMeasureCache } from "@/lib/poster/text";
import { resolveStyle } from "@/lib/poster/styles";
import { templateFor } from "@/lib/poster/templates";
import type {
  MutableReport,
  RenderReport,
  RenderTarget,
  PosterScene,
} from "@/lib/poster/template";

/** Telugu script needs its own locale for grapheme segmentation. */
function localeFor(design: PosterDesign): string {
  return design.language === "telugu" ? "te" : "en";
}

/** Every string the poster will set, for the font preloader. */
export function posterText(design: PosterDesign): string {
  const c = design.content;
  return [
    c.headline,
    c.subline,
    c.offerBig,
    c.offerSmall,
    c.terms,
    c.cta,
    c.validity,
    design.brand.name,
    design.brand.phone,
    design.brand.tagline,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Which image sources a design needs decoded before it can be drawn whole. */
export function posterImageSources(design: PosterDesign): string[] {
  const out: string[] = [];
  if (design.brand.logo) out.push(design.brand.logo.src);
  if (design.photo) out.push(design.photo.src);
  if (design.background.kind === "image") out.push(design.background.image.src);
  return out;
}

export function renderPoster(
  ctx: CanvasRenderingContext2D,
  design: PosterDesign,
  assets: PosterAssets,
  target: RenderTarget
): RenderReport {
  const started = typeof performance !== "undefined" ? performance.now() : 0;
  const report: MutableReport = { tight: [], missing: [] };

  // Cleared per render: a cache that outlived one render would go on serving
  // fallback-font widths forever after the real font arrived mid-session.
  resetMeasureCache();

  const { frame } = target;

  // setTransform, not scale(). It is absolute, so a template that leaks a
  // save() cannot compound across the hundreds of redraws a preview does while
  // someone is typing - which would otherwise show up as a poster that slowly
  // drifts off the frame and is maddening to trace back.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(target.scale, 0, 0, target.scale, 0, 0);

  // Alignment is inherited from CSS otherwise, and "start"/"end" flip with it.
  ctx.direction = "ltr";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const template = templateFor(design.templateId);
  const style = resolveStyle(design.styleId, target.stacks);
  // The shop's own colour wins over the preset's when they have set one.
  const resolved = design.brand.accentColor
    ? { ...style, accent: design.brand.accentColor }
    : style;

  // Always before the template, and always opaque. A PNG with transparent
  // corners sits on black in one app and white in another, and the owner only
  // finds out after they have posted it.
  paintBackground(ctx, design.background, frame, assets, resolved.base);

  // Art between the background and the words. The text area is shrunk by how
  // far the art reaches before any template lays anything out, which is what
  // keeps a garland off the headline without the template knowing about it.
  const decor = design.decor ?? [];
  paintDecor(ctx, decor, frame, resolved);
  const safe = shrinkForDecor(safeBox(frame, design.sizeId), decorInsets(decor, frame), frame);

  if (design.background.kind === "image" && !assets.get(design.background.image)) {
    report.missing.push("background");
  }

  const scene: PosterScene = {
    design,
    assets,
    frame,
    regions: template.regions(frame, safe),
    style: resolved,
    target,
    report,
    locale: localeFor(design),
  };

  template.draw(ctx, scene);

  return {
    tight: report.tight,
    missing: report.missing,
    ms: (typeof performance !== "undefined" ? performance.now() : 0) - started,
  };
}

/**
 * Where things are allowed to go on a poster.
 *
 * The design space IS the export size: a square poster is 1080x1080 design
 * units, and a template that writes `size: 88` means 88 pixels in the final
 * PNG. There is no abstract unit system to convert through. Scale is the only
 * difference between the preview and the export, `renderPoster` owns it, and
 * no template ever sees it.
 */

import { sizePixels, type PosterSize } from "@/types/poster";

export type PosterFrame = { width: number; height: number };

export type Box = { x: number; y: number; width: number; height: number };

export function frameFor(size: PosterSize): PosterFrame {
  return sizePixels(size);
}

/**
 * How much of each edge the platform eats.
 *
 * A Story is overlaid by the account header at the top and the reply bar at
 * the bottom, and WhatsApp Status adds its own progress bar - so roughly an
 * eighth at each end of a 1920-tall frame is not reliably visible. A feed post
 * is shown whole, so its inset is just margin.
 *
 * These are judgement calls from how the apps look, not published numbers.
 * Being a little too cautious costs a few pixels of margin; being too
 * confident puts the shop's phone number under a reply box.
 */
const SAFE_INSET: Record<PosterSize, { x: number; y: number }> = {
  square: { x: 0.055, y: 0.055 },
  story: { x: 0.06, y: 0.13 },
  landscape: { x: 0.05, y: 0.07 },
};

export function safeBox(frame: PosterFrame, size: PosterSize): Box {
  const inset = SAFE_INSET[size] ?? SAFE_INSET.square;
  const x = frame.width * inset.x;
  const y = frame.height * inset.y;
  return {
    x,
    y,
    width: frame.width - x * 2,
    height: frame.height - y * 2,
  };
}

/** The regions a template lays its content into. */
export type PosterRegions = {
  safe: Box;
  headline: Box;
  subline: Box;
  offer: Box;
  /**
   * Validity and conditions. Its own band rather than whatever gap is left
   * between the subline and the button - a leftover gap is however many pixels
   * happen to remain, which is how "Above 500 only" ends up printed across the
   * middle of the call to action.
   */
  terms: Box;
  cta: Box;
  brandBar: Box;
  art: Box;
};

/* ------------------------------------------------------------------ *
 * Box maths
 * ------------------------------------------------------------------ */

export function inset(box: Box, dx: number, dy = dx): Box {
  return {
    x: box.x + dx,
    y: box.y + dy,
    width: Math.max(0, box.width - dx * 2),
    height: Math.max(0, box.height - dy * 2),
  };
}

/** A horizontal slice of `box`, given as fractions of its height. */
export function band(box: Box, from: number, to: number): Box {
  return {
    x: box.x,
    y: box.y + box.height * from,
    width: box.width,
    height: box.height * (to - from),
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Aspect-fill, aiming at a focal point.
 *
 * The clamp is what stops the oversized image sliding far enough to leave a
 * gap at an edge when the focus is near a corner.
 */
export function coverRect(
  src: { width: number; height: number },
  dst: Box,
  focus: { x: number; y: number } = { x: 0.5, y: 0.5 }
): { x: number; y: number; w: number; h: number } {
  const scale = Math.max(dst.width / src.width, dst.height / src.height);
  const w = src.width * scale;
  const h = src.height * scale;
  const x = clamp(dst.x + dst.width * focus.x - w * focus.x, dst.x + dst.width - w, dst.x);
  const y = clamp(dst.y + dst.height * focus.y - h * focus.y, dst.y + dst.height - h, dst.y);
  return { x, y, w, h };
}

/**
 * Aspect-fit, centred.
 *
 * Logos use this rather than `coverRect`. A logo exported from a design tool
 * usually carries transparent padding, and filling the box crops it to a
 * corner of itself.
 */
export function containRect(
  src: { width: number; height: number },
  dst: Box
): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(dst.width / src.width, dst.height / src.height);
  const w = src.width * scale;
  const h = src.height * scale;
  return {
    x: dst.x + (dst.width - w) / 2,
    y: dst.y + (dst.height - h) / 2,
    w,
    h,
  };
}

/**
 * A rounded rectangle path.
 *
 * `ctx.roundRect` exists but only from Safari 16, and the fallback is short
 * enough that having one place to patch beats a feature check in every
 * template.
 */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  box: Box,
  radius: number
): void {
  const r = Math.min(radius, box.width / 2, box.height / 2);
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.width, box.height, r);
    return;
  }
  const { x, y, width: w, height: h } = box;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Nothing thinner than this.
 *
 * A one-unit hairline disappears at preview scale and then reappears in the
 * export, so the owner cannot see what they are about to download.
 */
export const MIN_STROKE = 3;

/**
 * The pieces every template draws the same way.
 *
 * The brand bar in particular: the shop name, phone and logo have to land in
 * the same place at the same weight on every poster, because that consistency
 * is what makes a month of posts look like one shop rather than six different
 * ones.
 */

import { containRect, roundRectPath, type Box } from "@/lib/poster/frame";
import { cssFont, setFont } from "@/lib/poster/fonts";
import { drawText, layoutText, type TextSpec } from "@/lib/poster/text";
import type { PosterScene, SlotId } from "@/lib/poster/template";

function note(scene: PosterScene, slot: SlotId, tight: boolean): void {
  if (tight && !scene.report.tight.includes(slot)) scene.report.tight.push(slot);
}

/**
 * A headline or subline, with this scene's defaults filled in and the result
 * reported back so the composer can tell the owner when something had to
 * shrink to fit.
 */
export function drawBlock(
  ctx: CanvasRenderingContext2D,
  scene: PosterScene,
  slot: SlotId,
  spec: Omit<TextSpec, "locale">
): ReturnType<typeof drawText> {
  const laid = drawText(ctx, { ...spec, locale: scene.locale });
  note(scene, slot, laid.tight);
  return laid;
}

/* ------------------------------------------------------------------ *
 * The offer
 * ------------------------------------------------------------------ */

/**
 * The reason most of these posters exist.
 *
 * Two lines at very different sizes - "1 + 1" enormous over "BUY 1 GET 1 FREE"
 * small - which is why the offer is carried as structure rather than as one
 * string. It sits on an accent slab so it survives any background, including
 * a photo we did not choose.
 */
export function drawOfferSlab(
  ctx: CanvasRenderingContext2D,
  scene: PosterScene,
  box: Box,
  opts: { filled?: boolean } = {}
): void {
  const { design, style } = scene;
  const big = design.content.offerBig.trim();
  if (!big) return;

  const small = design.content.offerSmall.trim();
  const filled = opts.filled ?? true;
  const ink = filled ? style.onAccent : style.accent;

  if (filled) {
    ctx.save();
    ctx.fillStyle = style.accent;
    roundRectPath(ctx, box, Math.min(box.height * 0.16, 44));
    ctx.fill();
    ctx.restore();
  }

  const pad = box.height * 0.12;
  const inner: Box = {
    x: box.x + pad,
    y: box.y + pad,
    width: box.width - pad * 2,
    height: box.height - pad * 2,
  };

  // The small line gets a fixed slice off the bottom so the big number can
  // take everything else - it is the thing people read from across a room.
  const smallHeight = small ? inner.height * 0.24 : 0;
  const bigBox: Box = { ...inner, height: inner.height - smallHeight };

  const laidBig = drawText(ctx, {
    text: big,
    box: bigBox,
    family: style.display,
    weight: style.displayWeight,
    size: Math.round(bigBox.height * 0.94),
    minSize: Math.round(bigBox.height * 0.3),
    lineHeight: 1,
    align: "center",
    vAlign: "middle",
    color: ink,
    maxLines: 1,
    locale: scene.locale,
  });
  note(scene, "offer", laidBig.tight);

  if (small) {
    drawText(ctx, {
      text: small,
      box: {
        x: inner.x,
        y: inner.y + inner.height - smallHeight,
        width: inner.width,
        height: smallHeight,
      },
      family: style.display,
      weight: 700,
      size: Math.round(smallHeight * 0.62),
      minSize: Math.round(smallHeight * 0.34),
      lineHeight: 1.05,
      align: "center",
      vAlign: "middle",
      color: ink,
      maxLines: 1,
      locale: scene.locale,
    });
  }
}

/* ------------------------------------------------------------------ *
 * Small print and the call to action
 * ------------------------------------------------------------------ */

/** "Till 30 Sep · Above ₹1000 only" - the line nobody reads until they do. */
export function drawTerms(
  ctx: CanvasRenderingContext2D,
  scene: PosterScene,
  box: Box
): number {
  const { design, style } = scene;
  const parts = [design.content.validity, design.content.terms].filter(Boolean);
  if (parts.length === 0) return 0;

  // Sized against the band it was given, not just the frame. Shrink-to-fit can
  // only search down to `minSize`, so a size chosen purely from frame width
  // overflows a short band no matter how hard the search tries - and what it
  // overflows into is the button underneath.
  const size = Math.max(
    12,
    Math.min(Math.round(scene.frame.width * 0.026), Math.floor(box.height * 0.62))
  );

  const laid = drawText(ctx, {
    text: parts.join("  ·  "),
    box,
    family: style.body,
    weight: style.bodyWeight,
    size,
    minSize: Math.max(10, Math.round(size * 0.7)),
    lineHeight: 1.15,
    align: "center",
    vAlign: "middle",
    color: style.inkMuted,
    maxLines: 1,
    locale: scene.locale,
  });
  return laid.bounds.height;
}

export function drawCtaPill(
  ctx: CanvasRenderingContext2D,
  scene: PosterScene,
  box: Box
): void {
  const { design, style } = scene;
  const label = design.content.cta.trim();
  if (!label) return;

  const size = Math.round(box.height * 0.42);
  const spec: TextSpec = {
    text: label,
    box: { ...box, width: box.width * 0.86 },
    family: style.display,
    weight: 700,
    size,
    minSize: Math.round(size * 0.6),
    lineHeight: 1,
    align: "center",
    vAlign: "middle",
    color: style.onAccent,
    maxLines: 1,
    locale: scene.locale,
  };

  // Measure first so the pill hugs the label instead of spanning the poster.
  const laid = layoutText(ctx, spec);
  ctx.save();
  setFont(ctx, cssFont(700, laid.size, style.display));
  const textWidth = Math.min(ctx.measureText(label).width, box.width * 0.86);
  ctx.restore();

  const padX = box.height * 0.42;
  const pillWidth = Math.min(textWidth + padX * 2, box.width);
  const pill: Box = {
    x: box.x + (box.width - pillWidth) / 2,
    y: box.y,
    width: pillWidth,
    height: box.height,
  };

  ctx.save();
  ctx.fillStyle = style.accent;
  roundRectPath(ctx, pill, pill.height / 2);
  ctx.fill();
  ctx.restore();

  drawText(ctx, { ...spec, box: pill });
}

/* ------------------------------------------------------------------ *
 * The brand bar
 * ------------------------------------------------------------------ */

/**
 * Logo, shop name, phone. The reason a poster is theirs and not generic.
 *
 * The logo is fitted rather than filled: a logo exported from a design tool
 * usually carries transparent padding, and filling the box crops it down to a
 * corner of itself. When a logo is set but has not decoded yet the space is
 * left empty and the miss is reported, so the composer can say "still loading
 * your logo" instead of silently shipping a poster without it.
 */
export function drawBrandBar(
  ctx: CanvasRenderingContext2D,
  scene: PosterScene,
  box: Box,
  opts: { panel?: boolean } = {}
): void {
  const { design, style } = scene;
  const name = design.brand.name.trim();
  const phone = design.brand.phone.trim();
  const tagline = design.brand.tagline.trim();
  const logoRef = design.brand.logo;

  if (!name && !phone && !logoRef) return;

  if (opts.panel) {
    ctx.save();
    ctx.fillStyle = style.panel;
    roundRectPath(ctx, box, Math.min(box.height * 0.28, 32));
    ctx.fill();
    ctx.restore();
  }

  const padX = box.height * 0.28;
  let cursorX = box.x + padX;
  const available = box.width - padX * 2;

  if (logoRef) {
    const img = scene.assets.get(logoRef);
    if (img) {
      const slot: Box = {
        x: cursorX,
        y: box.y + box.height * 0.16,
        width: box.height * 0.68,
        height: box.height * 0.68,
      };
      const fit = containRect({ width: img.naturalWidth, height: img.naturalHeight }, slot);
      ctx.drawImage(img, fit.x, fit.y, fit.w, fit.h);
      cursorX += slot.width + padX * 0.7;
    } else if (!scene.report.missing.includes("logo")) {
      scene.report.missing.push("logo");
    }
  }

  const textWidth = box.x + box.width - padX - cursorX;
  if (textWidth <= 0) return;

  // Sized and spaced for Telugu rather than for Latin. Telugu hangs vowel
  // signs below the baseline, so a name set as large as Latin allows brings
  // its own descenders down into the phone number underneath it.
  const nameSize = Math.round(box.height * 0.3);
  const nameBox: Box = {
    x: cursorX,
    y: box.y + box.height * (tagline || phone ? 0.12 : 0.3),
    width: textWidth,
    height: box.height * 0.4,
  };

  if (name) {
    drawText(ctx, {
      text: name,
      box: nameBox,
      family: style.display,
      weight: 700,
      size: nameSize,
      minSize: Math.round(nameSize * 0.6),
      lineHeight: 1.05,
      align: "left",
      vAlign: "middle",
      color: opts.panel ? style.onPanel : style.ink,
      maxLines: 1,
      locale: scene.locale,
    });
  }

  const second = [phone, tagline].filter(Boolean).join("  ·  ");
  if (second) {
    const secondSize = Math.round(box.height * 0.21);
    drawText(ctx, {
      text: second,
      box: {
        x: cursorX,
        y: box.y + box.height * 0.6,
        width: textWidth,
        height: box.height * 0.28,
      },
      family: style.body,
      weight: style.bodyWeight,
      size: secondSize,
      minSize: Math.round(secondSize * 0.65),
      lineHeight: 1.1,
      align: "left",
      vAlign: "middle",
      color: opts.panel ? style.onPanel : style.inkMuted,
      maxLines: 1,
      locale: scene.locale,
    });
  }

  // The brand bar is the one block that must never be shortened into
  // uselessness - a poster with half a phone number on it is worse than one
  // with none. Report it so the composer can say so.
  if (available < box.height * 2) note(scene, "brand", true);
}

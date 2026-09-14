/**
 * Festive art, drawn in code.
 *
 * Diyas, marigold garlands, rangoli, kites, lanterns. Every shape here is an
 * original vector drawing rather than a picture copied from somewhere, which
 * is what lets it recolour with the palette, stay sharp at any export size,
 * and actually belong to the product.
 *
 * Two rules every ornament follows:
 *
 * - It declares its `insets`: how far in from each edge it reaches. The layout
 *   shrinks the text area by those amounts before any template runs, so a
 *   garland across the top can never land on the headline, and a row of lamps
 *   can never sit under the shop's phone number.
 *
 * - It names natural colours only where the thing has one. A marigold is
 *   orange and a flame is yellow on every palette; the gold of a lamp or a
 *   frame comes from `style.accent`, so it changes when the palette does.
 *
 * Sizes are in multiples of the frame's shorter side, so the same ornament
 * reads at the right scale on a square post, a tall status and a short banner.
 */

import type { DecorKind, PosterDecor } from "@/types/poster";
import type { Box, PosterFrame } from "@/lib/poster/frame";
import type { ResolvedStyle } from "@/lib/poster/styles";
import { mix, withAlpha } from "@/lib/poster/color";

export type Insets = { top: number; bottom: number; left: number; right: number };

export const NO_INSETS: Insets = { top: 0, bottom: 0, left: 0, right: 0 };

type Ornament = {
  insets(frame: PosterFrame): Partial<Insets>;
  draw(ctx: CanvasRenderingContext2D, frame: PosterFrame, style: ResolvedStyle): void;
};

/** The shorter side. Ornaments scale from this so a wide banner does not get giant lamps. */
function unit(frame: PosterFrame): number {
  return Math.min(frame.width, frame.height);
}

function isWide(frame: PosterFrame): boolean {
  return frame.width > frame.height * 1.4;
}

/** Deterministic scatter: the same poster gets the same sparkles every render. */
function seeded(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/* ------------------------------------------------------------------ *
 * Small shared shapes
 * ------------------------------------------------------------------ */

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** A soft pool of light. Additive-looking without needing a blend mode. */
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, withAlpha(color, alpha));
  g.addColorStop(0.45, withAlpha(color, alpha * 0.45));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A four-pointed twinkle with pinched sides. */
function twinkle(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function star5(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** An almond leaf pointing along `angle`, anchored at its stem. */
function leaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  width: number,
  angle: number,
  fill: string
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(width, length * 0.45, 0, length);
  ctx.quadraticCurveTo(-width, length * 0.45, 0, 0);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  // The midrib, so it reads as a leaf rather than a petal.
  ctx.beginPath();
  ctx.moveTo(0, length * 0.08);
  ctx.lineTo(0, length * 0.9);
  ctx.strokeStyle = withAlpha("#052E16", 0.35);
  ctx.lineWidth = Math.max(1.5, width * 0.12);
  ctx.stroke();
  ctx.restore();
}

/** Points spaced evenly along a quadratic curve, with the tangent at each. */
function alongQuadratic(
  ax: number,
  ay: number,
  cx: number,
  cy: number,
  bx: number,
  by: number,
  spacing: number
): { x: number; y: number; angle: number }[] {
  const at = (t: number) => ({
    x: (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cx + t * t * bx,
    y: (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cy + t * t * by,
  });
  const out: { x: number; y: number; angle: number }[] = [];
  let travelled = spacing / 2;
  let prev = at(0);
  const steps = 240;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const next = at(t);
    travelled += Math.hypot(next.x - prev.x, next.y - prev.y);
    if (travelled >= spacing) {
      travelled -= spacing;
      const dx = 2 * (1 - t) * (cx - ax) + 2 * t * (bx - cx);
      const dy = 2 * (1 - t) * (cy - ay) + 2 * t * (by - cy);
      out.push({ x: next.x, y: next.y, angle: Math.atan2(dy, dx) });
    }
    prev = next;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Diya row
 * ------------------------------------------------------------------ */

function drawDiya(ctx: CanvasRenderingContext2D, cx: number, baseY: number, w: number, style: ResolvedStyle): void {
  const bowlH = w * 0.4;
  const rimY = baseY - bowlH;
  const gold = style.accent;
  const shadow = mix(gold, "#000000", 0.45);

  // Light first, so the bowl sits in front of its own glow.
  const flameH = w * 0.62;
  glow(ctx, cx, rimY - flameH * 0.45, flameH * 1.25, "#FFB547", 0.55);

  // The bowl: the lower half of an ellipse, lit from above.
  ctx.beginPath();
  ctx.ellipse(cx, rimY, w / 2, bowlH, 0, 0, Math.PI);
  ctx.closePath();
  const body = ctx.createLinearGradient(0, rimY, 0, baseY);
  body.addColorStop(0, mix(gold, "#FFFFFF", 0.18));
  body.addColorStop(1, shadow);
  ctx.fillStyle = body;
  ctx.fill();

  // A band of dots around the belly - the painted pattern on a clay diya.
  const dots = 7;
  for (let i = 0; i < dots; i += 1) {
    const angle = Math.PI * (0.18 + (0.64 * i) / (dots - 1));
    circle(ctx, cx + Math.cos(angle) * w * 0.34, rimY + Math.sin(angle) * bowlH * 0.55, w * 0.028, style.onAccent);
  }

  // The opening, with oil in it.
  ctx.beginPath();
  ctx.ellipse(cx, rimY, w / 2, w * 0.09, 0, 0, Math.PI * 2);
  ctx.fillStyle = mix(gold, "#000000", 0.6);
  ctx.fill();
  ctx.lineWidth = Math.max(3, w * 0.035);
  ctx.strokeStyle = mix(gold, "#FFFFFF", 0.25);
  ctx.stroke();

  // The flame: a teardrop, hotter at the core.
  const fw = w * 0.17;
  const fy = rimY - w * 0.01;
  ctx.beginPath();
  ctx.moveTo(cx, fy);
  ctx.bezierCurveTo(cx - fw, fy - flameH * 0.25, cx - fw * 0.5, fy - flameH * 0.72, cx, fy - flameH);
  ctx.bezierCurveTo(cx + fw * 0.5, fy - flameH * 0.72, cx + fw, fy - flameH * 0.25, cx, fy);
  ctx.closePath();
  const flame = ctx.createLinearGradient(0, fy, 0, fy - flameH);
  flame.addColorStop(0, "#FF6A00");
  flame.addColorStop(0.45, "#FFA21A");
  flame.addColorStop(1, "#FFE39A");
  ctx.fillStyle = flame;
  ctx.fill();

  const core = flameH * 0.48;
  ctx.beginPath();
  ctx.moveTo(cx, fy - flameH * 0.04);
  ctx.bezierCurveTo(cx - fw * 0.45, fy - core * 0.3, cx - fw * 0.22, fy - core * 0.78, cx, fy - core);
  ctx.bezierCurveTo(cx + fw * 0.22, fy - core * 0.78, cx + fw * 0.45, fy - core * 0.3, cx, fy - flameH * 0.04);
  ctx.closePath();
  ctx.fillStyle = "#FFF8E1";
  ctx.fill();
}

function diyaLayout(frame: PosterFrame) {
  const u = unit(frame);
  const count = isWide(frame) ? 7 : 5;
  const margin = frame.width * 0.07;
  const slot = (frame.width - margin * 2) / count;
  const width = Math.min(slot * 0.62, u * 0.13);
  const bottomGap = u * 0.035;
  // Largest in the middle, so the row has a centre rather than reading as a fence.
  const scales = Array.from({ length: count }, (_, i) => {
    const fromMiddle = Math.abs(i - (count - 1) / 2) / ((count - 1) / 2);
    return 1.08 - fromMiddle * 0.22;
  });
  return { count, margin, slot, width, bottomGap, scales };
}

const diyaRow: Ornament = {
  insets(frame) {
    const { width, bottomGap } = diyaLayout(frame);
    const tallest = width * 1.08;
    return { bottom: bottomGap + tallest * 0.4 + tallest * 0.62 + unit(frame) * 0.02 };
  },
  draw(ctx, frame, style) {
    const { count, margin, slot, width, bottomGap, scales } = diyaLayout(frame);
    const baseY = frame.height - bottomGap;
    for (let i = 0; i < count; i += 1) {
      drawDiya(ctx, margin + slot * (i + 0.5), baseY, width * scales[i], style);
    }
  },
};

/* ------------------------------------------------------------------ *
 * Marigold toran
 * ------------------------------------------------------------------ */

const MARIGOLD = [
  { outer: "#EA580C", inner: "#F97316", heart: "#9A3412" },
  { outer: "#F59E0B", inner: "#FACC15", heart: "#B45309" },
];

function drawMarigold(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, tone: number): void {
  const c = MARIGOLD[tone % MARIGOLD.length];
  // Ruffled edge: a ring of small overlapping discs reads as dense petals.
  const ruffles = 11;
  for (let i = 0; i < ruffles; i += 1) {
    const a = (i / ruffles) * Math.PI * 2;
    circle(ctx, x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.42, c.outer);
  }
  circle(ctx, x, y, r * 0.7, c.inner);
  const inner = 7;
  for (let i = 0; i < inner; i += 1) {
    const a = (i / inner) * Math.PI * 2 + 0.3;
    circle(ctx, x + Math.cos(a) * r * 0.32, y + Math.sin(a) * r * 0.32, r * 0.24, c.outer);
  }
  circle(ctx, x, y, r * 0.16, c.heart);
}

function toranLayout(frame: PosterFrame) {
  const u = unit(frame);
  const wide = isWide(frame);
  return {
    swags: wide ? 5 : 4,
    sag: u * (wide ? 0.06 : 0.075),
    r: u * (wide ? 0.02 : 0.024),
    pendantFlowers: wide ? 2 : 3,
  };
}

const marigoldToran: Ornament = {
  insets(frame) {
    const { sag, r, pendantFlowers } = toranLayout(frame);
    const pendant = r * 0.9 + pendantFlowers * r * 1.5 + r * 2.2;
    return { top: Math.max(sag + r * 1.4, pendant) + unit(frame) * 0.025 };
  },
  draw(ctx, frame, style) {
    const { swags, sag, r, pendantFlowers } = toranLayout(frame);
    const top = r * 0.6;
    const span = frame.width / swags;

    // Mango leaves along the top edge, the way a toran is actually hung.
    const leaves = Math.ceil(frame.width / (r * 1.9));
    for (let i = 0; i < leaves; i += 1) {
      const x = (i + 0.5) * (frame.width / leaves);
      const tilt = (seeded(i) - 0.5) * 0.35;
      leaf(ctx, x, -r * 0.2, r * 2.6, r * 0.8, tilt, i % 2 === 0 ? "#15803D" : "#166534");
    }

    // A cord in the palette's gold, so the garland is tied to the design.
    ctx.lineWidth = Math.max(3, r * 0.14);
    ctx.strokeStyle = withAlpha(style.accent, 0.7);
    for (let s = 0; s < swags; s += 1) {
      const ax = s * span;
      const bx = (s + 1) * span;
      ctx.beginPath();
      ctx.moveTo(ax, top);
      ctx.quadraticCurveTo((ax + bx) / 2, top + sag * 2, bx, top);
      ctx.stroke();
    }

    for (let s = 0; s < swags; s += 1) {
      const ax = s * span;
      const bx = (s + 1) * span;
      const points = alongQuadratic(ax, top, (ax + bx) / 2, top + sag * 2, bx, top, r * 1.45);
      points.forEach((p, i) => drawMarigold(ctx, p.x, p.y, r, i + s));
    }

    // Strands dropping from where the swags meet, each finished with a leaf.
    for (let s = 1; s < swags; s += 1) {
      const x = s * span;
      for (let k = 0; k < pendantFlowers; k += 1) {
        drawMarigold(ctx, x, top + r * 0.9 + k * r * 1.5, r * 0.92, k + s + 1);
      }
      leaf(ctx, x, top + r * 0.9 + pendantFlowers * r * 1.5 - r * 0.4, r * 2.2, r * 0.75, 0, "#15803D");
    }
  },
};

/* ------------------------------------------------------------------ *
 * Rangoli corners
 * ------------------------------------------------------------------ */

function drawRangoli(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, style: ResolvedStyle): void {
  const primary = style.accent;
  const secondary = style.contrast === "dark" ? "#F472B6" : "#DB2777";
  const tertiary = style.contrast === "dark" ? mix(style.ink, style.accent, 0.3) : "#D97706";

  const petalRing = (radius: number, count: number, length: number, width: number, fill: string, offset = 0) => {
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + offset;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, 0, length / 2, width / 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();
    }
  };

  // Outermost first, so the inner rings sit on top like layered powder.
  petalRing(R * 0.86, 14, R * 0.26, R * 0.12, primary);
  petalRing(R * 0.86, 14, R * 0.13, R * 0.05, secondary);

  const dots = 36;
  for (let i = 0; i < dots; i += 1) {
    const a = (i / dots) * Math.PI * 2;
    circle(ctx, cx + Math.cos(a) * R * 0.68, cy + Math.sin(a) * R * 0.68, R * 0.018, tertiary);
  }

  petalRing(R * 0.5, 16, R * 0.2, R * 0.085, secondary, Math.PI / 16);
  petalRing(R * 0.5, 16, R * 0.1, R * 0.04, primary, Math.PI / 16);

  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.34, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(3, R * 0.02);
  ctx.strokeStyle = primary;
  ctx.stroke();

  petalRing(R * 0.2, 8, R * 0.17, R * 0.08, primary);
  circle(ctx, cx, cy, R * 0.09, secondary);
  circle(ctx, cx, cy, R * 0.045, tertiary);
}

function rangoliRadius(frame: PosterFrame): number {
  return unit(frame) * (isWide(frame) ? 0.26 : 0.21);
}

const rangoliCorners: Ornament = {
  insets(frame) {
    const R = rangoliRadius(frame);
    // Only the two diagonal corners, so each rangoli frames rather than boxes
    // in. The full radius is reserved: a centred headline long enough to span
    // the poster otherwise runs straight into the corner piece.
    return { top: R * 0.95, bottom: R * 0.95 };
  },
  draw(ctx, frame, style) {
    const R = rangoliRadius(frame);
    drawRangoli(ctx, 0, 0, R, style);
    drawRangoli(ctx, frame.width, frame.height, R, style);
  },
};

/* ------------------------------------------------------------------ *
 * Fireworks
 * ------------------------------------------------------------------ */

function drawBurst(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, colors: string[], seed: number): void {
  glow(ctx, cx, cy, R * 0.6, colors[0], 0.35);
  const rays = 22;
  ctx.lineCap = "round";
  for (let i = 0; i < rays; i += 1) {
    const a = (i / rays) * Math.PI * 2 + seeded(seed) * 0.5;
    const inner = R * (0.18 + seeded(seed + i) * 0.12);
    const outer = R * (0.78 + seeded(seed + i * 3) * 0.22);
    const color = colors[i % colors.length];
    const x1 = cx + Math.cos(a) * inner;
    const y1 = cy + Math.sin(a) * inner;
    const x2 = cx + Math.cos(a) * outer;
    const y2 = cy + Math.sin(a) * outer;
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, withAlpha(color, 0));
    g.addColorStop(1, withAlpha(color, 0.95));
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(3, R * 0.03);
    ctx.stroke();
    circle(ctx, x2, y2, Math.max(2.5, R * 0.032), color);
  }
  twinkle(ctx, cx, cy, R * 0.12, "#FFFFFF");
}

const fireworks: Ornament = {
  insets(frame) {
    // The brightest part of a burst is the tips of its rays, so the reserve is
    // measured to the furthest tip, not to the centre.
    return { top: unit(frame) * 0.27 };
  },
  draw(ctx, frame, style) {
    const u = unit(frame);
    const palette = [style.accent, "#F472B6", "#67E8F9"];
    drawBurst(ctx, frame.width * 0.14, u * 0.11, u * 0.12, palette, 1);
    drawBurst(ctx, frame.width * 0.84, u * 0.13, u * 0.13, [palette[1], palette[0], palette[2]], 7);
    drawBurst(ctx, frame.width * 0.5, u * 0.06, u * 0.06, [palette[2], palette[0]], 13);
  },
};

/* ------------------------------------------------------------------ *
 * Bunting
 * ------------------------------------------------------------------ */

const FLAG_COLORS = ["#FACC15", "#EC4899", "#22D3EE", "#A3E635", "#F97316", "#FFFFFF"];

function buntingLayout(frame: PosterFrame) {
  const u = unit(frame);
  return { top: u * 0.02, sag: u * 0.065, flagW: u * 0.058, flagH: u * 0.078 };
}

const bunting: Ornament = {
  insets(frame) {
    const { top, sag, flagH } = buntingLayout(frame);
    return { top: top + sag + flagH + unit(frame) * 0.03 };
  },
  draw(ctx, frame, style) {
    const { top, sag, flagW, flagH } = buntingLayout(frame);
    const swags = isWide(frame) ? 3 : 2;
    const span = frame.width / swags;
    let flag = 0;
    for (let s = 0; s < swags; s += 1) {
      const ax = s * span;
      const bx = (s + 1) * span;
      const cx = (ax + bx) / 2;
      const cy = top + sag * 2;

      ctx.beginPath();
      ctx.moveTo(ax, top);
      ctx.quadraticCurveTo(cx, cy, bx, top);
      ctx.strokeStyle = withAlpha(style.ink, 0.7);
      ctx.lineWidth = Math.max(3, flagW * 0.05);
      ctx.stroke();

      for (const p of alongQuadratic(ax, top, cx, cy, bx, top, flagW * 1.12)) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.beginPath();
        ctx.moveTo(-flagW / 2, 0);
        ctx.lineTo(flagW / 2, 0);
        ctx.lineTo(0, flagH);
        ctx.closePath();
        ctx.fillStyle = FLAG_COLORS[flag % FLAG_COLORS.length];
        ctx.fill();
        // A darker fold down one side gives the flag a little depth.
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(flagW / 2, 0);
        ctx.lineTo(0, flagH);
        ctx.closePath();
        ctx.fillStyle = withAlpha("#000000", 0.12);
        ctx.fill();
        ctx.restore();
        flag += 1;
      }
    }
  },
};

/* ------------------------------------------------------------------ *
 * Kites
 * ------------------------------------------------------------------ */

function drawKite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  rotation: number,
  left: string,
  right: string,
  tailSide: 1 | -1
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  const top = { x: 0, y: -s };
  const r = { x: s * 0.72, y: -s * 0.22 };
  const bottom = { x: 0, y: s * 0.95 };
  const l = { x: -s * 0.72, y: -s * 0.22 };

  // The tail first, so the sail covers where it is tied on.
  ctx.beginPath();
  ctx.moveTo(bottom.x, bottom.y);
  ctx.bezierCurveTo(tailSide * s * 0.5, s * 1.5, -tailSide * s * 0.4, s * 1.9, tailSide * s * 0.2, s * 2.5);
  ctx.strokeStyle = withAlpha("#FFFFFF", 0.75);
  ctx.lineWidth = Math.max(3, s * 0.03);
  ctx.stroke();
  for (let i = 1; i <= 3; i += 1) {
    const t = i / 4;
    const bx = tailSide * s * (0.35 * Math.sin(t * Math.PI * 1.4));
    const by = bottom.y + t * s * 1.5;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(0.4 * tailSide);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-s * 0.12, -s * 0.07);
    ctx.lineTo(-s * 0.12, s * 0.07);
    ctx.closePath();
    ctx.moveTo(0, 0);
    ctx.lineTo(s * 0.12, -s * 0.07);
    ctx.lineTo(s * 0.12, s * 0.07);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? left : right;
    ctx.fill();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(l.x, l.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.closePath();
  ctx.fillStyle = left;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(r.x, r.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.closePath();
  ctx.fillStyle = right;
  ctx.fill();

  // The spars.
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.moveTo(l.x, l.y);
  ctx.quadraticCurveTo(0, -s * 0.42, r.x, r.y);
  ctx.strokeStyle = withAlpha("#000000", 0.3);
  ctx.lineWidth = Math.max(3, s * 0.035);
  ctx.stroke();

  ctx.restore();
}

const kites: Ornament = {
  insets(frame) {
    return { top: unit(frame) * 0.25 };
  },
  draw(ctx, frame, style) {
    const u = unit(frame);
    drawKite(ctx, frame.width * 0.82, u * 0.12, u * 0.085, 0.28, style.accent, "#F43F5E", -1);
    drawKite(ctx, frame.width * 0.16, u * 0.09, u * 0.06, -0.32, "#FB923C", "#FFFFFF", 1);
    // A third, far off and small, gives the sky some depth.
    drawKite(ctx, frame.width * 0.62, u * 0.05, u * 0.032, 0.1, "#A3E635", style.accent, 1);
  },
};

/* ------------------------------------------------------------------ *
 * String lights
 * ------------------------------------------------------------------ */

const BULBS = ["#FDE047", "#F472B6", "#67E8F9", "#86EFAC", "#FDBA74"];

function lightsLayout(frame: PosterFrame) {
  const u = unit(frame);
  return { top: u * 0.015, sag: u * 0.05, bulb: u * 0.017, spacing: u * 0.075 };
}

const stringLights: Ornament = {
  insets(frame) {
    const { top, sag, bulb } = lightsLayout(frame);
    return { top: top + sag + bulb * 3.4 + unit(frame) * 0.03 };
  },
  draw(ctx, frame, style) {
    const { top, sag, bulb, spacing } = lightsLayout(frame);
    const swags = isWide(frame) ? 4 : 3;
    const span = frame.width / swags;
    let n = 0;
    for (let s = 0; s < swags; s += 1) {
      const ax = s * span;
      const bx = (s + 1) * span;
      const cx = (ax + bx) / 2;
      const cy = top + sag * 2;

      ctx.beginPath();
      ctx.moveTo(ax, top);
      ctx.quadraticCurveTo(cx, cy, bx, top);
      ctx.strokeStyle = withAlpha(style.ink, 0.55);
      ctx.lineWidth = Math.max(3, bulb * 0.2);
      ctx.stroke();

      for (const p of alongQuadratic(ax, top, cx, cy, bx, top, spacing)) {
        const color = BULBS[n % BULBS.length];
        n += 1;
        glow(ctx, p.x, p.y + bulb * 1.6, bulb * 4.2, color, 0.5);
        // Socket.
        ctx.fillStyle = withAlpha(style.ink, 0.7);
        ctx.fillRect(p.x - bulb * 0.42, p.y - bulb * 0.1, bulb * 0.84, bulb * 0.7);
        // Bulb.
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + bulb * 1.5, bulb * 0.72, bulb, 0, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        circle(ctx, p.x - bulb * 0.22, p.y + bulb * 1.2, bulb * 0.22, withAlpha("#FFFFFF", 0.7));
      }
    }
  },
};

/* ------------------------------------------------------------------ *
 * Gold frame
 * ------------------------------------------------------------------ */

function frameLayout(frame: PosterFrame) {
  const u = unit(frame);
  return { outer: u * 0.03, inner: u * 0.047, bracket: u * 0.09 };
}

const goldFrame: Ornament = {
  insets(frame) {
    const { inner } = frameLayout(frame);
    const all = inner + unit(frame) * 0.04;
    return { top: all, bottom: all, left: all, right: all };
  },
  draw(ctx, frame, style) {
    const { outer, inner, bracket } = frameLayout(frame);
    const u = unit(frame);
    const W = frame.width;
    const H = frame.height;

    ctx.strokeStyle = style.accent;
    ctx.lineWidth = Math.max(4, u * 0.007);
    ctx.strokeRect(outer, outer, W - outer * 2, H - outer * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = withAlpha(style.accent, 0.75);
    ctx.strokeRect(inner, inner, W - inner * 2, H - inner * 2);

    // Corner brackets with a diamond, the detail that makes a border read as
    // deliberate rather than as a rectangle someone forgot to fill.
    const corners: [number, number, number, number][] = [
      [inner, inner, 1, 1],
      [W - inner, inner, -1, 1],
      [inner, H - inner, 1, -1],
      [W - inner, H - inner, -1, -1],
    ];
    const gap = u * 0.018;
    for (const [x, y, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + dx * gap, y + dy * (gap + bracket));
      ctx.lineTo(x + dx * gap, y + dy * gap);
      ctx.lineTo(x + dx * (gap + bracket), y + dy * gap);
      ctx.strokeStyle = style.accent;
      ctx.lineWidth = Math.max(3, u * 0.005);
      ctx.stroke();

      const d = u * 0.016;
      ctx.beginPath();
      ctx.moveTo(x, y - d);
      ctx.lineTo(x + d, y);
      ctx.lineTo(x, y + d);
      ctx.lineTo(x - d, y);
      ctx.closePath();
      ctx.fillStyle = style.accent;
      ctx.fill();
    }
  },
};

/* ------------------------------------------------------------------ *
 * Crescent and lanterns
 * ------------------------------------------------------------------ */

function drawLantern(
  ctx: CanvasRenderingContext2D,
  x: number,
  hangLength: number,
  s: number,
  style: ResolvedStyle
): void {
  const gold = style.accent;
  const dark = mix(gold, "#000000", 0.4);

  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, hangLength);
  ctx.strokeStyle = withAlpha(gold, 0.8);
  ctx.lineWidth = 3;
  ctx.stroke();

  const y = hangLength;
  glow(ctx, x, y + s * 0.6, s * 1.1, "#FFD166", 0.45);

  // Ring and cap.
  ctx.beginPath();
  ctx.arc(x, y + s * 0.03, s * 0.06, 0, Math.PI * 2);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - s * 0.12, y + s * 0.09);
  ctx.lineTo(x + s * 0.12, y + s * 0.09);
  ctx.lineTo(x + s * 0.3, y + s * 0.24);
  ctx.lineTo(x - s * 0.3, y + s * 0.24);
  ctx.closePath();
  ctx.fillStyle = gold;
  ctx.fill();

  // The glass: bulging sides, lit from inside.
  const topY = y + s * 0.24;
  const botY = y + s * 0.95;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.24, topY);
  ctx.bezierCurveTo(x - s * 0.44, topY + s * 0.2, x - s * 0.44, botY - s * 0.2, x - s * 0.2, botY);
  ctx.lineTo(x + s * 0.2, botY);
  ctx.bezierCurveTo(x + s * 0.44, botY - s * 0.2, x + s * 0.44, topY + s * 0.2, x + s * 0.24, topY);
  ctx.closePath();
  const light = ctx.createRadialGradient(x, (topY + botY) / 2, s * 0.02, x, (topY + botY) / 2, s * 0.42);
  light.addColorStop(0, "#FFF4C2");
  light.addColorStop(0.55, "#FFC94A");
  light.addColorStop(1, dark);
  ctx.fillStyle = light;
  ctx.fill();

  ctx.strokeStyle = withAlpha(dark, 0.8);
  ctx.lineWidth = 3;
  for (const offset of [-0.14, 0, 0.14]) {
    ctx.beginPath();
    ctx.moveTo(x + s * offset, topY);
    ctx.quadraticCurveTo(x + s * offset * 1.8, (topY + botY) / 2, x + s * offset, botY);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(x - s * 0.22, botY);
  ctx.lineTo(x + s * 0.22, botY);
  ctx.lineTo(x + s * 0.1, botY + s * 0.12);
  ctx.lineTo(x - s * 0.1, botY + s * 0.12);
  ctx.closePath();
  ctx.fillStyle = gold;
  ctx.fill();

  // Tassel.
  ctx.beginPath();
  ctx.moveTo(x, botY + s * 0.12);
  ctx.lineTo(x, botY + s * 0.24);
  ctx.strokeStyle = gold;
  ctx.stroke();
  circle(ctx, x, botY + s * 0.28, s * 0.045, gold);
}

function drawCrescent(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, frame: PosterFrame): void {
  glow(ctx, x, y, r * 2.2, fill, 0.3);
  ctx.save();
  // Clip to everything except the biting circle, then fill the moon.
  ctx.beginPath();
  ctx.rect(0, 0, frame.width, frame.height);
  ctx.arc(x + r * 0.42, y - r * 0.2, r * 0.86, 0, Math.PI * 2, true);
  ctx.clip("evenodd");
  circle(ctx, x, y, r, fill);
  ctx.restore();
}

const crescentLanterns: Ornament = {
  insets(frame) {
    return { top: unit(frame) * 0.27 };
  },
  draw(ctx, frame, style) {
    const u = unit(frame);
    drawCrescent(ctx, frame.width * 0.83, u * 0.13, u * 0.07, style.accent, frame);
    const stars: [number, number, number][] = [
      [0.7, 0.07, 0.016],
      [0.93, 0.24, 0.012],
      [0.62, 0.17, 0.01],
      [0.95, 0.06, 0.009],
    ];
    for (const [fx, fy, fr] of stars) star5(ctx, frame.width * fx, u * fy, u * fr, style.accent);
    drawLantern(ctx, frame.width * 0.11, u * 0.05, u * 0.12, style);
    drawLantern(ctx, frame.width * 0.25, u * 0.1, u * 0.1, style);
  },
};

/* ------------------------------------------------------------------ *
 * Floral corners
 * ------------------------------------------------------------------ */

function drawFlower(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, petal: string, heart: string, turn: number): void {
  const petals = 5;
  for (let i = 0; i < petals; i += 1) {
    const a = (i / petals) * Math.PI * 2 + turn;
    ctx.save();
    ctx.translate(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.55, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fillStyle = petal;
    ctx.fill();
    ctx.restore();
  }
  circle(ctx, x, y, r * 0.24, heart);
}

function drawBouquet(ctx: CanvasRenderingContext2D, ox: number, oy: number, dx: 1 | -1, dy: 1 | -1, u: number, style: ResolvedStyle): void {
  const at = (fx: number, fy: number) => ({ x: ox + dx * u * fx, y: oy + dy * u * fy });
  const green = "#15803D";

  // Leaves fanning out from the corner behind the flowers.
  const leafAngles = [0.15, 0.55, 0.95, 1.3];
  leafAngles.forEach((a, i) => {
    const angle = Math.atan2(dy, dx) - Math.PI / 2 + (a - 0.7) * 1.1;
    const p = at(0.02, 0.02);
    leaf(ctx, p.x, p.y, u * (0.2 + (i % 2) * 0.05), u * 0.045, angle, i % 2 === 0 ? green : "#166534");
  });

  const blooms = [
    { fx: 0.08, fy: 0.06, r: 0.058, petal: "#FFFFFF" },
    { fx: 0.19, fy: 0.03, r: 0.04, petal: "#FBCFE8" },
    { fx: 0.04, fy: 0.17, r: 0.042, petal: style.accent },
    { fx: 0.16, fy: 0.13, r: 0.03, petal: "#FBCFE8" },
  ];
  blooms.forEach((b, i) => {
    const p = at(b.fx, b.fy);
    drawFlower(ctx, p.x, p.y, u * b.r, b.petal, i === 2 ? "#FFFFFF" : style.accent, i * 0.6);
  });
}

const floralCorners: Ornament = {
  insets(frame) {
    const u = unit(frame);
    return { top: u * 0.24, bottom: u * 0.24 };
  },
  draw(ctx, frame, style) {
    const u = unit(frame);
    drawBouquet(ctx, 0, 0, 1, 1, u, style);
    drawBouquet(ctx, frame.width, frame.height, -1, -1, u, style);
  },
};

/* ------------------------------------------------------------------ *
 * Quiet background texture
 *
 * These reserve no space, so they are kept soft enough that the words over
 * them stay readable - the contrast checks in styles.ts only know about the
 * background colour, not about what is drawn on it.
 * ------------------------------------------------------------------ */

const sparkles: Ornament = {
  insets() {
    return {};
  },
  draw(ctx, frame, style) {
    const u = unit(frame);
    const count = 18;
    for (let i = 0; i < count; i += 1) {
      // Mostly along the sides, where there is no text to sit behind.
      const edge = seeded(i * 5 + 1) < 0.8;
      const side = seeded(i * 7 + 2) < 0.5;
      const x = edge
        ? side
          ? seeded(i * 11 + 3) * frame.width * 0.16
          : frame.width * (0.84 + seeded(i * 13 + 4) * 0.16)
        : seeded(i * 17 + 5) * frame.width;
      const y = seeded(i * 19 + 6) * frame.height;
      const s = u * (0.008 + seeded(i * 23 + 7) * 0.014);
      twinkle(ctx, x, y, s, withAlpha(style.accent, 0.55 + seeded(i * 29) * 0.4));
    }
  },
};

const bokeh: Ornament = {
  insets() {
    return {};
  },
  draw(ctx, frame, style) {
    const u = unit(frame);
    const colors = [style.accent, "#F472B6", "#FDBA74"];
    for (let i = 0; i < 12; i += 1) {
      const x = seeded(i * 3 + 11) * frame.width;
      // Weighted toward the lower half, where lamps and lights would be.
      const y = frame.height * (0.35 + seeded(i * 5 + 13) * 0.65);
      const r = u * (0.03 + seeded(i * 7 + 17) * 0.07);
      glow(ctx, x, y, r, colors[i % colors.length], 0.18 + seeded(i * 11) * 0.14);
    }
  },
};

const softCircles: Ornament = {
  insets() {
    return {};
  },
  draw(ctx, frame, style) {
    const u = unit(frame);
    circle(ctx, frame.width * 0.96, u * 0.02, u * 0.34, withAlpha(style.accent, 0.07));
    circle(ctx, frame.width * 0.02, frame.height - u * 0.02, u * 0.26, withAlpha(style.accent, 0.06));
    ctx.beginPath();
    ctx.arc(frame.width * 0.9, frame.height * 0.8, u * 0.11, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(style.accent, 0.14);
    ctx.lineWidth = Math.max(3, u * 0.006);
    ctx.stroke();
  },
};

/* ------------------------------------------------------------------ *
 * The map
 * ------------------------------------------------------------------ */

/**
 * A plain object checked with `satisfies`, for the same reasons as the template
 * map: nothing depends on import side effects, and a DecorKind without a
 * drawing is a compile error rather than a blank space on someone's poster.
 */
const ORNAMENTS = {
  diya_row: diyaRow,
  marigold_toran: marigoldToran,
  rangoli_corners: rangoliCorners,
  fireworks,
  bunting,
  kites,
  string_lights: stringLights,
  gold_frame: goldFrame,
  crescent_lanterns: crescentLanterns,
  floral_corners: floralCorners,
  sparkles,
  bokeh,
  soft_circles: softCircles,
} satisfies Record<DecorKind, Ornament>;

function ornamentFor(kind: string): Ornament | null {
  return (ORNAMENTS as Record<string, Ornament>)[kind] ?? null;
}

/** The furthest any ornament reaches in from each edge. */
export function decorInsets(decor: PosterDecor[], frame: PosterFrame): Insets {
  const out: Insets = { ...NO_INSETS };
  for (const item of decor) {
    const ornament = ornamentFor(item.kind);
    if (!ornament) continue;
    const reach = ornament.insets(frame);
    out.top = Math.max(out.top, reach.top ?? 0);
    out.bottom = Math.max(out.bottom, reach.bottom ?? 0);
    out.left = Math.max(out.left, reach.left ?? 0);
    out.right = Math.max(out.right, reach.right ?? 0);
  }
  return out;
}

/**
 * Draws every ornament, in the order the design lists them.
 *
 * An unknown kind is skipped rather than thrown on: a poster saved by a newer
 * build with an ornament this build does not have should still open, just
 * without that one piece of art.
 */
export function paintDecor(
  ctx: CanvasRenderingContext2D,
  decor: PosterDecor[],
  frame: PosterFrame,
  style: ResolvedStyle
): void {
  for (const item of decor) {
    const ornament = ornamentFor(item.kind);
    if (!ornament) continue;
    ctx.save();
    ornament.draw(ctx, frame, style);
    ctx.restore();
  }
}

/**
 * The text area once the ornaments have taken their share.
 *
 * Never shrunk past a floor: on a short banner, a garland and a row of lamps
 * together would otherwise leave nowhere for the words at all. When decor asks
 * for more than that, the words win and the ornaments overlap the edges a
 * little, which is the better of the two failures.
 */
export function shrinkForDecor(safe: Box, insets: Insets, frame: PosterFrame): Box {
  const floor = 0.62;

  let top = Math.max(0, insets.top - safe.y);
  let bottom = Math.max(0, insets.bottom - (frame.height - (safe.y + safe.height)));
  const vertical = top + bottom;
  const maxVertical = safe.height * (1 - floor);
  if (vertical > maxVertical) {
    top *= maxVertical / vertical;
    bottom *= maxVertical / vertical;
  }

  let left = Math.max(0, insets.left - safe.x);
  let right = Math.max(0, insets.right - (frame.width - (safe.x + safe.width)));
  const horizontal = left + right;
  const maxHorizontal = safe.width * (1 - floor);
  if (horizontal > maxHorizontal) {
    left *= maxHorizontal / horizontal;
    right *= maxHorizontal / horizontal;
  }

  return {
    x: safe.x + left,
    y: safe.y + top,
    width: safe.width - left - right,
    height: safe.height - top - bottom,
  };
}

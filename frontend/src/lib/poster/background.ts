/**
 * Everything behind the words.
 *
 * `paintBackground` runs before any template draws, and no template touches
 * the background at all. That separation is the whole reason a generated
 * image can arrive later as just another `kind` here, with no template
 * rewritten: the union grows by one case and the rest of the renderer does not
 * notice.
 *
 * The canvas is always painted opaque. A PNG with transparent corners renders
 * on black in one app and white in another, and the owner finds that out after
 * they have already posted it.
 */

import type { PosterBackground, PosterOverlay, PosterPatternId } from "@/types/poster";
import type { PosterAssets } from "@/lib/poster/images";
import { coverRect, type Box, type PosterFrame } from "@/lib/poster/frame";

function fullBox(frame: PosterFrame): Box {
  return { x: 0, y: 0, width: frame.width, height: frame.height };
}

/** Deterministic scatter: the same poster gets the same confetti every time. */
function seeded(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function paintBackground(
  ctx: CanvasRenderingContext2D,
  background: PosterBackground,
  frame: PosterFrame,
  assets: PosterAssets
): void {
  const box = fullBox(frame);

  switch (background.kind) {
    case "solid": {
      ctx.fillStyle = background.color;
      ctx.fillRect(0, 0, frame.width, frame.height);
      return;
    }

    case "gradient": {
      const radians = (background.angle * Math.PI) / 180;
      const half = Math.max(frame.width, frame.height);
      const cx = frame.width / 2;
      const cy = frame.height / 2;
      const gradient = ctx.createLinearGradient(
        cx - (Math.cos(radians) * half) / 2,
        cy - (Math.sin(radians) * half) / 2,
        cx + (Math.cos(radians) * half) / 2,
        cy + (Math.sin(radians) * half) / 2
      );
      gradient.addColorStop(0, background.from);
      gradient.addColorStop(1, background.to);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, frame.width, frame.height);
      return;
    }

    case "pattern": {
      ctx.fillStyle = background.color;
      ctx.fillRect(0, 0, frame.width, frame.height);
      paintPattern(ctx, background.patternId, background.accent, frame);
      return;
    }

    case "image": {
      const img = assets.get(background.image);
      if (!img) {
        // The image has not decoded yet, or failed. Something opaque still has
        // to be here, or the export carries transparent pixels.
        ctx.fillStyle = "#111827";
        ctx.fillRect(0, 0, frame.width, frame.height);
        return;
      }
      const fit = coverRect(
        { width: img.naturalWidth, height: img.naturalHeight },
        box,
        background.image.focus
      );
      ctx.drawImage(img, fit.x, fit.y, fit.w, fit.h);
      paintOverlay(ctx, background.overlay, frame);
      return;
    }
  }
}

function paintOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: PosterOverlay,
  frame: PosterFrame
): void {
  if (overlay.kind === "none") return;

  if (overlay.kind === "tint") {
    ctx.save();
    ctx.globalAlpha = overlay.alpha;
    ctx.fillStyle = overlay.color;
    ctx.fillRect(0, 0, frame.width, frame.height);
    ctx.restore();
    return;
  }

  // A scrim: text has to stay readable over a photograph we did not choose.
  const up = overlay.direction === "up";
  const gradient = ctx.createLinearGradient(0, up ? frame.height : 0, 0, up ? 0 : frame.height);
  gradient.addColorStop(0, withAlpha(overlay.color, overlay.from));
  gradient.addColorStop(1, withAlpha(overlay.color, overlay.to));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, frame.width, frame.height);
}

function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "").slice(0, 6);
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ------------------------------------------------------------------ *
 * Patterns
 *
 * Deliberately quiet. These sit under a headline and an offer slab, so their
 * job is to stop a flat colour looking like a default - not to be looked at.
 * ------------------------------------------------------------------ */

function paintPattern(
  ctx: CanvasRenderingContext2D,
  patternId: PosterPatternId,
  accent: string,
  frame: PosterFrame
): void {
  ctx.save();
  ctx.fillStyle = accent;

  switch (patternId) {
    case "rays": {
      // A sunburst from just above the top edge, so the wedges fan downward
      // across the poster rather than radiating from a visible point.
      const cx = frame.width / 2;
      const cy = -frame.height * 0.1;
      const reach = frame.width + frame.height;
      const count = 20;
      for (let i = 0; i < count; i += 2) {
        const a1 = (i / count) * Math.PI * 2;
        const a2 = ((i + 1) / count) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a1) * reach, cy + Math.sin(a1) * reach);
        ctx.lineTo(cx + Math.cos(a2) * reach, cy + Math.sin(a2) * reach);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }

    case "mandala": {
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(3, frame.width * 0.004);
      const cx = frame.width / 2;
      const cy = frame.height / 2;
      const step = frame.width * 0.09;
      for (let r = step; r < frame.width * 0.75; r += step) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Petals around the outermost ring.
      const petals = 12;
      const ring = frame.width * 0.42;
      for (let i = 0; i < petals; i += 1) {
        const angle = (i / petals) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle) * ring, cy + Math.sin(angle) * ring, step * 0.45, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }

    case "confetti": {
      const count = 46;
      for (let i = 0; i < count; i += 1) {
        const x = seeded(i * 3 + 1) * frame.width;
        const y = seeded(i * 3 + 2) * frame.height;
        const size = frame.width * (0.012 + seeded(i * 3 + 3) * 0.016);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(seeded(i * 7) * Math.PI);
        ctx.fillRect(-size / 2, -size / 6, size, size / 3);
        ctx.restore();
      }
      break;
    }

    case "diagonal": {
      const width = frame.width * 0.06;
      ctx.save();
      ctx.translate(frame.width / 2, frame.height / 2);
      ctx.rotate(-Math.PI / 4);
      const reach = frame.width + frame.height;
      for (let x = -reach; x < reach; x += width * 2) {
        ctx.fillRect(x, -reach, width, reach * 2);
      }
      ctx.restore();
      break;
    }

    case "plain":
      break;
  }

  ctx.restore();
}

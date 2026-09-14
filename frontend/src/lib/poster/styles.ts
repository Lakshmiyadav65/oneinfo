/**
 * The palettes, as colour.
 *
 * A template never names a colour. It asks for `style.ink`, `style.accent`,
 * `style.onAccent` - so the same template draws a festive gold poster and a
 * clean white one without knowing which it is doing. Decor follows the same
 * rule, which is why a diya drawn on the Royal palette and on the Emerald one
 * both look like they belong.
 *
 * Backgrounds are built from a palette's colours rather than stored whole. A
 * gallery design says "rays" or "gradient"; the palette says which colours.
 * That separation is what lets an owner switch palettes on a design without
 * ending up with dark text on a dark background they did not choose.
 *
 * `contrast` is declared per palette today. The day backgrounds are generated
 * rather than chosen, it gets sampled from the image instead, and because
 * templates only ever read it through here, none of them change.
 */

import type { PosterBackground, PosterPatternId, PosterStyle } from "@/types/poster";
import type { PosterFontStacks } from "@/lib/poster/fonts";

export type ResolvedStyle = {
  id: PosterStyle;
  /** Body and headline text sitting directly on the background. */
  ink: string;
  inkMuted: string;
  /** The offer slab, the badge, the CTA pill, gold in the decor. */
  accent: string;
  /** Text on top of `accent`. */
  onAccent: string;
  /** A panel laid over the background, for the brand bar. */
  panel: string;
  onPanel: string;
  contrast: "light" | "dark";
  display: string;
  body: string;
  displayWeight: number;
  headlineWeight: number;
  bodyWeight: number;
  /** The background's own colours, for decor that has to sit into it. */
  base: string;
  pattern: string;
};

/** How a background is painted, independent of which colours it uses. */
export type BackgroundLook = PosterPatternId | "gradient" | "solid";

type Palette = Omit<ResolvedStyle, "display" | "body" | "id"> & {
  from: string;
  to: string;
  angle: number;
  look: BackgroundLook;
};

const PALETTES: Record<PosterStyle, Palette> = {
  festive_gold: {
    ink: "#FFF7E6",
    inkMuted: "#E8D3A8",
    accent: "#F5C542",
    onAccent: "#4A0A14",
    panel: "#00000055",
    onPanel: "#FFF7E6",
    contrast: "dark",
    displayWeight: 800,
    headlineWeight: 800,
    bodyWeight: 400,
    base: "#6B0F1A",
    pattern: "#8C1626",
    from: "#7A1220",
    to: "#4A0A14",
    angle: 160,
    look: "rays",
  },
  bold_offer: {
    ink: "#FFFFFF",
    inkMuted: "#FFE4D6",
    accent: "#FFFFFF",
    onAccent: "#C2260F",
    panel: "#00000044",
    onPanel: "#FFFFFF",
    contrast: "dark",
    displayWeight: 800,
    headlineWeight: 800,
    bodyWeight: 500,
    // Starts at a deeper red than the obvious orange. #F97316 is the prettier
    // colour but only reaches 2.8:1 against white text, and this palette exists
    // to be read across a shop from a phone screen.
    base: "#B91C1C",
    pattern: "#DC2626",
    from: "#DC2626",
    to: "#8C1407",
    angle: 135,
    look: "gradient",
  },
  clean_minimal: {
    ink: "#111827",
    inkMuted: "#6B7280",
    accent: "#111827",
    onAccent: "#FFFFFF",
    panel: "#F3F4F6",
    onPanel: "#111827",
    contrast: "light",
    displayWeight: 800,
    headlineWeight: 700,
    bodyWeight: 400,
    base: "#FFFFFF",
    pattern: "#F3F4F6",
    from: "#FFFFFF",
    to: "#F3F4F6",
    angle: 180,
    look: "solid",
  },
  warm_traditional: {
    ink: "#6B1020",
    inkMuted: "#9A5A2C",
    accent: "#6B1020",
    onAccent: "#FDF3D8",
    panel: "#F3DFAE",
    onPanel: "#6B1020",
    contrast: "light",
    displayWeight: 800,
    headlineWeight: 700,
    bodyWeight: 400,
    base: "#FDF3D8",
    pattern: "#EBD08E",
    from: "#FDF3D8",
    to: "#F6E3B4",
    angle: 180,
    look: "mandala",
  },
  modern_dark: {
    ink: "#F9FAFB",
    inkMuted: "#9CA3AF",
    accent: "#F59E0B",
    onAccent: "#111827",
    panel: "#1F2937",
    onPanel: "#F9FAFB",
    contrast: "dark",
    displayWeight: 800,
    headlineWeight: 700,
    bodyWeight: 400,
    base: "#111827",
    pattern: "#1F2937",
    from: "#1F2937",
    to: "#0B0F17",
    angle: 160,
    look: "gradient",
  },
  playful_bright: {
    ink: "#FFFFFF",
    inkMuted: "#F5D0FE",
    accent: "#FDE047",
    onAccent: "#4C1D95",
    panel: "#00000033",
    onPanel: "#FFFFFF",
    contrast: "dark",
    displayWeight: 800,
    headlineWeight: 800,
    bodyWeight: 500,
    // Indigo-600 and -700 rather than 500: the lighter one lands at 4.47:1,
    // which is near enough to pass by eye and not near enough to pass.
    base: "#4F46E5",
    pattern: "#4338CA",
    from: "#4F46E5",
    to: "#BE185D",
    angle: 145,
    look: "gradient",
  },
  royal_purple: {
    ink: "#FFF7E6",
    inkMuted: "#E9D5FF",
    accent: "#F5C542",
    onAccent: "#3B0764",
    panel: "#00000044",
    onPanel: "#FFF7E6",
    contrast: "dark",
    displayWeight: 800,
    headlineWeight: 800,
    bodyWeight: 400,
    base: "#3B0764",
    pattern: "#581C87",
    from: "#4C1D95",
    to: "#2E1065",
    angle: 160,
    look: "gradient",
  },
  sky_blue: {
    ink: "#FFFFFF",
    inkMuted: "#E0F2FE",
    accent: "#FACC15",
    onAccent: "#0C4A6E",
    panel: "#00000033",
    onPanel: "#FFFFFF",
    contrast: "dark",
    displayWeight: 800,
    headlineWeight: 800,
    bodyWeight: 500,
    // Deeper than a real sky. The kite-day blue people picture is around
    // #38BDF8, which gives white text barely 2:1.
    base: "#075985",
    pattern: "#0369A1",
    from: "#0369A1",
    to: "#0C4A6E",
    angle: 180,
    look: "gradient",
  },
  emerald_gold: {
    ink: "#FFFBEB",
    inkMuted: "#D1FAE5",
    accent: "#FBBF24",
    onAccent: "#064E3B",
    panel: "#00000040",
    onPanel: "#FFFBEB",
    contrast: "dark",
    displayWeight: 800,
    headlineWeight: 700,
    bodyWeight: 400,
    base: "#065F46",
    pattern: "#047857",
    from: "#047857",
    to: "#064E3B",
    angle: 165,
    look: "gradient",
  },
  rose_pink: {
    ink: "#FFFFFF",
    inkMuted: "#FCE7F3",
    accent: "#FDE68A",
    onAccent: "#831843",
    panel: "#00000033",
    onPanel: "#FFFFFF",
    contrast: "dark",
    displayWeight: 800,
    headlineWeight: 800,
    bodyWeight: 400,
    base: "#9D174D",
    pattern: "#BE185D",
    from: "#BE185D",
    to: "#831843",
    angle: 150,
    look: "gradient",
  },
};

function paletteFor(id: PosterStyle): Palette {
  return PALETTES[id] ?? PALETTES.festive_gold;
}

export function resolveStyle(id: PosterStyle, stacks: PosterFontStacks): ResolvedStyle {
  const p = paletteFor(id);
  return {
    id,
    ink: p.ink,
    inkMuted: p.inkMuted,
    accent: p.accent,
    onAccent: p.onAccent,
    panel: p.panel,
    onPanel: p.onPanel,
    contrast: p.contrast,
    displayWeight: p.displayWeight,
    headlineWeight: p.headlineWeight,
    bodyWeight: p.bodyWeight,
    base: p.base,
    pattern: p.pattern,
    display: stacks.display,
    body: stacks.body,
  };
}

/**
 * A background in this palette's colours.
 *
 * `look` comes from the gallery design when there is one, and from the
 * palette's own preference otherwise.
 */
export function backgroundFor(id: PosterStyle, look?: BackgroundLook): PosterBackground {
  const p = paletteFor(id);
  const chosen = look ?? p.look;
  if (chosen === "solid") return { kind: "solid", color: p.base };
  if (chosen === "gradient") return { kind: "gradient", from: p.from, to: p.to, angle: p.angle };
  return { kind: "pattern", patternId: chosen, color: p.base, accent: p.pattern };
}

/** Light or dark ground, for choosing how to dim a photo under this palette. */
export function paletteContrast(id: PosterStyle): "light" | "dark" {
  return paletteFor(id).contrast;
}

/** A swatch for the palette picker, so the choice is seen rather than named. */
export function styleSwatch(id: PosterStyle): { from: string; to: string; ink: string } {
  const p = paletteFor(id);
  return { from: p.from, to: p.to, ink: p.accent };
}

/* ------------------------------------------------------------------ *
 * Contrast
 * ------------------------------------------------------------------ */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "").slice(0, 6);
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * A poster's contrast cannot be linted, because the output is an image.
 *
 * So it is checked here instead, once, in development, against every colour
 * the text can land on - the solid ground, both ends of the gradient, and the
 * pattern's second colour. Text nobody can read is the actual failure mode for
 * this feature: a shop owner will not notice on a bright phone screen, and
 * their customers will see it on every other kind.
 */
function assertReadableInDev(): void {
  if (process.env.NODE_ENV === "production") return;
  for (const [id, p] of Object.entries(PALETTES)) {
    for (const ground of [p.base, p.pattern, p.from, p.to]) {
      const ratio = contrastRatio(p.ink, ground);
      if (ratio < 4.5) {
        console.warn(`[poster] palette "${id}": ink on ${ground} is ${ratio.toFixed(2)}:1, below 4.5`);
      }
    }
    const onAccent = contrastRatio(p.onAccent, p.accent);
    if (onAccent < 4.5) {
      console.warn(`[poster] palette "${id}": text on accent is ${onAccent.toFixed(2)}:1, below 4.5`);
    }
  }
}

assertReadableInDev();

/**
 * The six looks, as colour.
 *
 * A template never names a colour. It asks for `style.ink`, `style.accent`,
 * `style.onAccent` - so the same template draws a festive gold poster and a
 * clean white one without knowing which it is doing. That is also what makes
 * the later move to generated backgrounds cheap: `contrast` is declared by the
 * style today and can be *computed* from a generated image tomorrow, and
 * because templates only ever read it through here, none of them change.
 */

import type { PosterBackground, PosterStyle } from "@/types/poster";
import type { PosterFontStacks } from "@/lib/poster/fonts";

export type ResolvedStyle = {
  id: PosterStyle;
  /** Body and headline text sitting directly on the background. */
  ink: string;
  inkMuted: string;
  /** The offer slab, the badge, the CTA pill. */
  accent: string;
  /** Text on top of `accent`. */
  onAccent: string;
  /** A panel laid over the background, for the brand bar. */
  panel: string;
  onPanel: string;
  /**
   * Whether the background is light or dark. Declared here today; the day a
   * background is generated rather than chosen, this gets sampled from the
   * image instead and nothing downstream notices.
   */
  contrast: "light" | "dark";
  display: string;
  body: string;
  displayWeight: number;
  headlineWeight: number;
  bodyWeight: number;
};

type StylePreset = Omit<ResolvedStyle, "display" | "body" | "id"> & {
  /** What this style paints behind everything when the owner has not chosen. */
  background: PosterBackground;
};

const PRESETS: Record<PosterStyle, StylePreset> = {
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
    background: { kind: "pattern", patternId: "rays", color: "#6B0F1A", accent: "#8C1626" },
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
    // Starts at a deeper orange than the obvious one. #F97316 is the prettier
    // colour but only reaches 2.8:1 against white text, and this style exists
    // to be read across a shop from a phone screen.
    background: { kind: "gradient", from: "#DC2626", to: "#8C1407", angle: 135 },
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
    background: { kind: "solid", color: "#FFFFFF" },
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
    background: { kind: "pattern", patternId: "mandala", color: "#FDF3D8", accent: "#EBD08E" },
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
    background: { kind: "gradient", from: "#1F2937", to: "#0B0F17", angle: 160 },
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
    // Indigo-600 rather than 500: the lighter one lands at 4.47:1, which is
    // near enough to pass by eye and not near enough to actually pass.
    background: { kind: "gradient", from: "#4F46E5", to: "#BE185D", angle: 145 },
  },
};

export function resolveStyle(id: PosterStyle, stacks: PosterFontStacks): ResolvedStyle {
  const preset = PRESETS[id] ?? PRESETS.festive_gold;
  return {
    id,
    ink: preset.ink,
    inkMuted: preset.inkMuted,
    accent: preset.accent,
    onAccent: preset.onAccent,
    panel: preset.panel,
    onPanel: preset.onPanel,
    contrast: preset.contrast,
    displayWeight: preset.displayWeight,
    headlineWeight: preset.headlineWeight,
    bodyWeight: preset.bodyWeight,
    display: stacks.display,
    body: stacks.body,
  };
}

/** What this style paints behind everything, before the owner changes it. */
export function defaultBackgroundFor(id: PosterStyle): PosterBackground {
  return (PRESETS[id] ?? PRESETS.festive_gold).background;
}

/** A swatch for the style picker, so the choice is visible rather than named. */
export function styleSwatch(id: PosterStyle): { from: string; to: string; ink: string } {
  const preset = PRESETS[id] ?? PRESETS.festive_gold;
  const bg = preset.background;
  if (bg.kind === "gradient") return { from: bg.from, to: bg.to, ink: preset.accent };
  if (bg.kind === "solid") return { from: bg.color, to: bg.color, ink: preset.accent };
  if (bg.kind === "pattern") return { from: bg.color, to: bg.accent, ink: preset.accent };
  return { from: "#000000", to: "#000000", ink: preset.accent };
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
 * So it is checked here instead, once, in development. Text nobody can read is
 * the actual failure mode for this feature - a shop owner will not notice on a
 * bright phone screen, and their customers will see it on every other kind.
 */
function assertReadableInDev(): void {
  if (process.env.NODE_ENV === "production") return;
  for (const [id, preset] of Object.entries(PRESETS)) {
    const bg = preset.background;
    const base =
      bg.kind === "solid" ? bg.color : bg.kind === "gradient" ? bg.from : bg.kind === "pattern" ? bg.color : null;
    if (!base) continue;

    const inkRatio = contrastRatio(preset.ink, base);
    if (inkRatio < 4.5) {
      console.warn(`[poster] style "${id}": ink on background is ${inkRatio.toFixed(2)}:1, below 4.5`);
    }
    const accentRatio = contrastRatio(preset.onAccent, preset.accent);
    if (accentRatio < 4.5) {
      console.warn(`[poster] style "${id}": text on accent is ${accentRatio.toFixed(2)}:1, below 4.5`);
    }
  }
}

assertReadableInDev();

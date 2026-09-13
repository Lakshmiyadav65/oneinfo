/**
 * Getting real fonts onto a canvas.
 *
 * Three things about canvas text are unobvious enough to have cost time, and
 * all three are handled here rather than at the call sites:
 *
 * 1. `ctx.font = "..."` is a SILENT no-op if any part of the string fails to
 *    parse. The context keeps whatever it had, which on a fresh context is
 *    `10px sans-serif`. Your 88px headline then draws at 10px and nothing
 *    throws. Everything goes through `cssFont()`, and in development we assert
 *    the assignment actually took.
 *
 * 2. Canvas drawing NEVER triggers a font load. If the face is not already in
 *    the FontFaceSet, `fillText` quietly uses a fallback and - worse -
 *    `measureText` returns fallback metrics, so the layout is wrong too.
 *    `document.fonts.ready` is not enough on its own: it settles only the
 *    faces the DOM currently needs, and these fonts are split by unicode-range
 *    so the subset carrying a rupee sign or a Telugu glyph may never have been
 *    asked for. `ensurePosterFonts` asks for them by sample text.
 *
 * 3. next/font does not export the family name it generates. It exports a
 *    class that sets a CSS variable, and layout.tsx puts that class on <html>.
 *    So the computed value of the variable is the family list, whatever
 *    next/font decided to call it this release - today a plain "Geist", but it
 *    has been a content hash before and may be again. That is the only reason
 *    this file reads the variable instead of writing the string.
 */

/** Latin sans, from next/font. */
const SANS_VAR = "--font-geist-sans";
/** Telugu face. Geist has no Telugu coverage at all - see resolveFontStacks. */
const TELUGU_VAR = "--font-telugu";

export type PosterFontStacks = {
  display: string;
  body: string;
};

function familyFromVar(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * One stack for everything, Latin face first.
 *
 * Canvas does per-glyph fallback across a family list exactly as CSS does, so
 * putting Geist first and the Telugu face second means Latin text is set in
 * Geist and only the glyphs Geist has no coverage for reach the Telugu face.
 * One stack rather than two also means a headline mixing "Ganesh Chaturthi"
 * with Telugu script does not need the caller to know which it is.
 *
 * The named fallbacks after that matter more than they look: Geist is loaded
 * with `subsets: ["latin"]`, so without a Telugu face in the list, Telugu text
 * falls through to whatever the operating system happens to provide - Nirmala
 * UI on Windows, Noto on Android, Kohinoor on iOS. For a feature whose output
 * is an image other people see, that means the same poster is a different
 * product on every device.
 */
export function resolveFontStacks(): PosterFontStacks {
  const sans = familyFromVar(SANS_VAR);
  const telugu = familyFromVar(TELUGU_VAR);
  const stack = [
    sans,
    telugu,
    '"Noto Sans Telugu"',
    '"Nirmala UI"',
    "system-ui",
    "sans-serif",
  ]
    .filter(Boolean)
    .join(", ");
  return { display: stack, body: stack };
}

/**
 * The only place a font string is built.
 *
 * Font sizes are always design units here; the canvas transform scales them.
 */
export function cssFont(weight: number, size: number, family: string): string {
  return `${weight} ${size}px ${family}`;
}

/**
 * Assigns a font and, in development, complains if the browser rejected it.
 *
 * Four lines that catch an entire class of silent bug - a malformed family
 * (an unquoted name with a space, usually) leaves the previous font in place
 * and the poster renders at the wrong size with no error anywhere.
 */
export function setFont(ctx: CanvasRenderingContext2D, font: string): void {
  ctx.font = font;
  if (process.env.NODE_ENV !== "production") {
    const size = font.match(/(\d+(?:\.\d+)?)px/)?.[1];
    if (size && !ctx.font.includes(`${size}px`)) {
      console.warn(`[poster] canvas rejected the font string: ${font}`);
    }
  }
}

export type FontRequest = { weight: number; size: number; family: string; sample: string };

/**
 * Load every face the poster will actually draw with, then wait.
 *
 * The sample string is load-bearing. These faces are split by unicode-range,
 * and `load()` only fetches the subsets the sample needs - so without the
 * poster's real text in it, a Telugu headline and a rupee sign both render in
 * a fallback while the call reports success.
 *
 * Note what is NOT attempted: detecting whether the right face actually
 * loaded. `load()` resolves happily when zero faces matched, and the
 * `local(Arial)` fallback face next/font emits always matches, so there is no
 * honest success signal to test. A poster set in a fallback font still beats
 * no poster, so we wait as long as is useful and then draw regardless.
 */
export async function ensurePosterFonts(requests: FontRequest[]): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(
    requests.map((r) =>
      document.fonts.load(cssFont(r.weight, r.size, r.family), r.sample).catch(() => undefined)
    )
  );
  await document.fonts.ready;
}

/**
 * The faces a given poster needs, from its own text.
 *
 * The rupee sign is appended unconditionally because it lives in latin-ext,
 * which is not preloaded, and almost every offer poster has one on it.
 */
export function fontRequestsFor(text: string, stacks: PosterFontStacks): FontRequest[] {
  const sample = `${text}₹0123456789`;
  return [
    { weight: 800, size: 96, family: stacks.display, sample },
    { weight: 700, size: 48, family: stacks.display, sample },
    { weight: 400, size: 36, family: stacks.body, sample },
  ];
}

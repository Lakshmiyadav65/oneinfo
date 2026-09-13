/**
 * Getting the poster off the screen and into WhatsApp.
 *
 * The rule that shapes this file: the blob is built BEFORE the click, never
 * inside it. On iOS an `await` inside a click handler spends the user-gesture
 * window, and everything that needs one - a programmatic download, the share
 * sheet, a clipboard write - is silently refused afterwards. So the composer
 * renders the file while the owner is still reading the preview, and the
 * button is bound to something that already exists.
 */

import type { PosterDesign } from "@/types/poster";
import { sizePixels } from "@/types/poster";
import { downloadSlug } from "@/lib/utils/filename";
import { ensurePosterFonts, fontRequestsFor, resolveFontStacks } from "@/lib/poster/fonts";
import { PosterImageStore, type PosterAssets } from "@/lib/poster/images";
import { posterImageSources, posterText, renderPoster } from "@/lib/poster/render";

export type PosterOutput = {
  blob: Blob;
  filename: string;
  type: string;
  width: number;
  height: number;
};

/**
 * PNG, except over a photograph.
 *
 * A flat-colour poster is both smaller and crisper as a PNG. A 1080x1920
 * poster over a photo is a three-to-five megabyte PNG, which matters on a shop
 * connection, and JPEG is indistinguishable at that size.
 */
function formatFor(design: PosterDesign): { type: string; quality: number; ext: string } {
  return design.background.kind === "image"
    ? { type: "image/jpeg", quality: 0.92, ext: "jpg" }
    : { type: "image/png", quality: 1, ext: "png" };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        // toBlob hands back null rather than throwing - usually a tainted
        // canvas, which here would mean an image from another origin.
        else reject(new Error("The poster couldn't be saved. Please try again."));
      },
      type,
      quality
    );
  });
}

/**
 * Renders the poster at full size, into a canvas of its own.
 *
 * Never the preview canvas: resizing that to 1080 would flash the UI and fight
 * the resize observer watching it.
 */
export async function renderPosterToBlob(
  design: PosterDesign,
  assets?: PosterAssets
): Promise<PosterOutput> {
  const { width, height } = sizePixels(design.sizeId);
  const stacks = resolveFontStacks();

  // The export waits for fonts; the preview does not. If it did not, the
  // downloaded file would have different metrics from what was on screen, and
  // the whole "the preview is the file" guarantee dies at the last step.
  await ensurePosterFonts(fontRequestsFor(posterText(design), stacks));

  // When the caller has no store (a thumbnail off a saved design, say), build
  // a throwaway one so the logo still makes it into the file.
  let store: PosterImageStore | null = null;
  let source = assets;
  if (!source) {
    store = new PosterImageStore();
    await store.loadAll(posterImageSources(design));
    source = store;
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser couldn't draw the poster.");

    renderPoster(ctx, design, source, {
      frame: { width, height },
      scale: 1,
      purpose: "export",
      stacks,
    });

    const { type, quality, ext } = formatFor(design);
    const blob = await canvasToBlob(canvas, type, quality);
    const name = design.content.occasion || design.content.headline || "poster";

    return {
      blob,
      filename: `${downloadSlug(name, "poster")}.${ext}`,
      type: blob.type || type,
      width,
      height,
    };
  } finally {
    await store?.releaseAll();
  }
}

/**
 * A small JPEG for the library grid.
 *
 * Stored, unlike the poster itself - but disposable: the record holds the
 * design, so a missing thumbnail is regenerated rather than lost.
 */
export async function renderThumbnail(design: PosterDesign, maxEdge = 320): Promise<string | null> {
  try {
    const { width, height } = sizePixels(design.sizeId);
    const scale = maxEdge / Math.max(width, height);
    const stacks = resolveFontStacks();

    const store = new PosterImageStore();
    await store.loadAll(posterImageSources(design));
    try {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      renderPoster(ctx, design, store, {
        frame: { width, height },
        scale,
        purpose: "preview",
        stacks,
      });
      return canvas.toDataURL("image/jpeg", 0.7);
    } finally {
      await store.releaseAll();
    }
  } catch {
    // A thumbnail is a convenience. Losing one must never fail a save.
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Sharing
 * ------------------------------------------------------------------ */

export type ShareResult = "shared" | "cancelled" | "unsupported" | "failed";

/**
 * Whether the share sheet will actually take this file.
 *
 * Tested with the real payload, not `!!navigator.share`: desktop Chrome
 * exposes `share` but refuses file payloads, so the bare check produces a
 * button that does nothing. Must be called from an effect - `navigator` does
 * not exist during server rendering.
 */
export function canSharePoster(output: PosterOutput): boolean {
  if (typeof navigator === "undefined" || !navigator.share || !navigator.canShare) return false;
  try {
    const file = new File([output.blob], output.filename, { type: output.type });
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export async function sharePoster(
  output: PosterOutput,
  caption: string,
  title: string
): Promise<ShareResult> {
  if (typeof navigator === "undefined" || !navigator.share) return "unsupported";
  const file = new File([output.blob], output.filename, { type: output.type });
  const data: ShareData = { files: [file], text: caption, title };
  if (navigator.canShare && !navigator.canShare(data)) return "unsupported";

  try {
    await navigator.share(data);
    return "shared";
  } catch (err) {
    // Dismissing the sheet is the most common outcome of opening it, and it
    // arrives here as a rejection. Treating it as an error means a "couldn't
    // share" toast every time someone changes their mind.
    if (err instanceof Error && err.name === "AbortError") return "cancelled";
    return "failed";
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Denied on purpose, usually. The caller shows the text to select by hand
    // rather than reaching for the deprecated execCommand path.
    return false;
  }
}

/**
 * Puts the image itself on the clipboard, so it can be pasted straight into
 * WhatsApp Web. Desktop only, and not in Firefox - hence the feature test.
 */
export async function copyImage(output: PosterOutput): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !("ClipboardItem" in window)) return false;
    if (!navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ [output.type]: output.blob })]);
    return true;
  } catch {
    return false;
  }
}

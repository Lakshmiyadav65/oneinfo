/**
 * Getting the shop's logo (and any photo) onto the canvas.
 *
 * `renderPoster` is synchronous, so decoding is a precondition rather than a
 * step inside it: the store preloads, and `get()` hands back a decoded image
 * or nothing. A missing image is reported rather than awaited, so a preview
 * that redraws on every keystroke never blocks on a file read.
 */

import type { PosterImageRef } from "@/types/poster";

export type PosterAssets = {
  get(ref: PosterImageRef | null | undefined): HTMLImageElement | undefined;
};

/** An assets bag with nothing in it, for previews before anything has loaded. */
export const NO_ASSETS: PosterAssets = { get: () => undefined };

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  // Only meaningful for http(s). Data URLs have no CORS handshake to opt into.
  // It matters for the day a generated background arrives from another origin:
  // without this (and the matching response header) the canvas is tainted and
  // toBlob throws at exactly the moment the owner hits Download.
  if (/^https?:/i.test(src)) img.crossOrigin = "anonymous";
  img.src = src;

  try {
    // decode() rather than onload. A loaded-but-undecoded image can block the
    // main thread on the first drawImage, or on Safari draw nothing at all for
    // one frame - which on a per-keystroke preview looks like a logo that
    // flickers in and out.
    await img.decode();
    return img;
  } catch {
    // decode() rejects on some SVGs that carry no intrinsic size.
    await new Promise<void>((resolve, reject) => {
      if (img.complete && img.naturalWidth > 0) return resolve();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("That image could not be read."));
    });
    return img;
  }
}

/**
 * Decoded images, keyed by source.
 *
 * Object URLs created here are owned here: `release` waits for the in-flight
 * load to settle before revoking, because revoking a URL whose load has not
 * finished makes that load fail silently.
 */
export class PosterImageStore implements PosterAssets {
  private images = new Map<string, HTMLImageElement>();
  private pending = new Map<string, Promise<HTMLImageElement>>();
  private owned = new Set<string>();

  get(ref: PosterImageRef | null | undefined): HTMLImageElement | undefined {
    if (!ref) return undefined;
    return this.images.get(ref.src);
  }

  has(src: string): boolean {
    return this.images.has(src);
  }

  /** Deduped, so two slots sharing one source decode once. */
  load(src: string): Promise<HTMLImageElement> {
    const ready = this.images.get(src);
    if (ready) return Promise.resolve(ready);

    const inFlight = this.pending.get(src);
    if (inFlight) return inFlight;

    const promise = loadImage(src)
      .then((img) => {
        this.images.set(src, img);
        this.pending.delete(src);
        return img;
      })
      .catch((err) => {
        this.pending.delete(src);
        throw err;
      });

    this.pending.set(src, promise);
    return promise;
  }

  /** Loads everything a design needs, ignoring the ones that fail. */
  async loadAll(srcs: (string | null | undefined)[]): Promise<void> {
    const wanted = srcs.filter((s): s is string => Boolean(s));
    await Promise.all(wanted.map((src) => this.load(src).catch(() => undefined)));
  }

  /** Takes a File and hands back a source this store will clean up. */
  adopt(file: File): string {
    const src = URL.createObjectURL(file);
    this.owned.add(src);
    return src;
  }

  async releaseAll(): Promise<void> {
    // Settle first: a revoke that races an in-flight decode makes it fail.
    await Promise.allSettled([...this.pending.values()]);
    for (const src of this.owned) URL.revokeObjectURL(src);
    this.owned.clear();
    this.images.clear();
    this.pending.clear();
  }
}

/* ------------------------------------------------------------------ *
 * Reading a file the owner picked
 * ------------------------------------------------------------------ */

export const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const LOGO_MAX_EDGE = 512;

/**
 * A picked file, downscaled and turned into a data URL.
 *
 * Data URL rather than an object URL because this is stored: a design has to
 * stay one self-contained JSON object that survives a reload, and an object
 * URL dies with the page. 512px is plenty for a logo that is drawn at around
 * 150 units, and it keeps the stored profile small enough to sit in
 * localStorage beside everything else.
 *
 * PNG rather than WebP: a logo usually has a transparent background, and the
 * format needs to be one every browser will re-decode without surprises.
 */
export async function fileToLogoDataUrl(file: File): Promise<string> {
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("That image is too large. Please pick one under 5 MB.");
  }

  const src = URL.createObjectURL(file);
  try {
    const img = await loadImage(src);
    const scale = Math.min(1, LOGO_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser could not prepare that image.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(src);
  }
}

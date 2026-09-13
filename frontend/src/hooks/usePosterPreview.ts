"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PosterDesign } from "@/types/poster";
import { sizePixels } from "@/types/poster";
import {
  ensurePosterFonts,
  fontRequestsFor,
  resolveFontStacks,
  type PosterFontStacks,
} from "@/lib/poster/fonts";
import { PosterImageStore } from "@/lib/poster/images";
import { posterImageSources, posterText, renderPoster } from "@/lib/poster/render";
import type { RenderReport } from "@/lib/poster/template";

/**
 * A live poster preview on a canvas.
 *
 * Two decisions are doing most of the work here.
 *
 * The redraw is coalesced with requestAnimationFrame rather than debounced.
 * Debouncing a preview makes typing feel laggy, which is exactly the feeling
 * this whole feature exists to avoid; coalescing caps the work at one draw per
 * frame no matter how fast someone types, and the frame drawn is always the
 * current state. If a draw ever gets expensive the answer is to drop the
 * preview's pixel density, not its responsiveness.
 *
 * The image store is created once via useState rather than in an effect. React
 * runs effects twice in development, and a store that revoked its object URLs
 * on the first cleanup would poison the second mount.
 */
export function usePosterPreview(design: PosterDesign | null) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [store] = useState(() => new PosterImageStore());
  const [stacks, setStacks] = useState<PosterFontStacks | null>(null);
  const [report, setReport] = useState<RenderReport | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  // The draw loop reads the latest of each of these rather than closing over
  // them, so a redraw scheduled by a resize still paints current content.
  //
  // Updated in an effect rather than during render, and declared before every
  // effect that schedules a draw - effects run in declaration order, so the
  // refs are current by the time any of them asks for a frame.
  const designRef = useRef(design);
  const stacksRef = useRef(stacks);
  const frameRef = useRef(0);

  useEffect(() => {
    designRef.current = design;
    stacksRef.current = stacks;
  });

  const paint = useCallback(() => {
    frameRef.current = 0;
    const canvas = canvasRef.current;
    const current = designRef.current;
    const fonts = stacksRef.current;
    if (!canvas || !current || !fonts) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const frame = sizePixels(current.sizeId);
    const cssWidth = Math.max(1, Math.floor(containerRef.current?.clientWidth ?? frame.width));
    const cssHeight = Math.round((cssWidth * frame.height) / frame.width);

    // Capped at 2: a 3x phone previewing at 400 CSS px would back it with 1200
    // pixels for no visible gain and more than twice the cost per keystroke.
    const dpr = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 2);
    const pxWidth = Math.round(cssWidth * dpr);
    const pxHeight = Math.round(cssHeight * dpr);

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    // Assigned only when it changed: writing canvas.width resets the entire 2D
    // state and clears the bitmap, which flashes on every resize observation.
    if (canvas.width !== pxWidth) canvas.width = pxWidth;
    if (canvas.height !== pxHeight) canvas.height = pxHeight;

    try {
      // Scale from the rounded backing size, not from cssWidth * dpr - a
      // fractional mismatch between the two reads on screen as blur.
      const next = renderPoster(ctx, current, store, {
        frame,
        scale: pxWidth / frame.width,
        purpose: "preview",
        stacks: fonts,
      });
      setReport(next);
      setFailed(null);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : "The poster couldn't be drawn.");
    }
  }, [store]);

  const schedule = useCallback(() => {
    if (frameRef.current || typeof window === "undefined") return;
    frameRef.current = window.requestAnimationFrame(paint);
  }, [paint]);

  // Font families live in CSS variables on <html>, so they can only be read in
  // the browser - which makes this exactly the "read from an external system
  // after mount" case, not a derived value that belongs in render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStacks(resolveFontStacks());
  }, []);

  // Ask for the faces this poster's own text needs. Canvas never triggers a
  // font load by itself, and these faces are split by unicode-range, so
  // without this a Telugu headline or a rupee sign silently draws in a
  // fallback - and measures wrong too.
  useEffect(() => {
    if (!design || !stacks) return;
    let alive = true;
    ensurePosterFonts(fontRequestsFor(posterText(design), stacks)).then(() => {
      if (alive) schedule();
    });
    return () => {
      alive = false;
    };
  }, [design, stacks, schedule]);

  // Decode whatever the design points at, then redraw. Until then the renderer
  // reports the gap rather than blocking on it.
  useEffect(() => {
    if (!design) return;
    let alive = true;
    const sources = posterImageSources(design);
    if (sources.length === 0) return;
    store.loadAll(sources).then(() => {
      if (alive) schedule();
    });
    return () => {
      alive = false;
    };
  }, [design, store, schedule]);

  useEffect(() => {
    schedule();
  }, [design, stacks, schedule]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => schedule());
    observer.observe(container);
    return () => observer.disconnect();
  }, [schedule]);

  useEffect(() => {
    // iOS discards canvas backing stores under memory pressure while a tab is
    // in the background, and a story-sized canvas comes back blank white.
    const onVisible = () => {
      if (document.visibilityState === "visible") schedule();
    };
    // A unicode-range subset can finish loading well after the first paint.
    const onFonts = () => schedule();

    document.addEventListener("visibilitychange", onVisible);
    document.fonts?.addEventListener("loadingdone", onFonts);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      document.fonts?.removeEventListener("loadingdone", onFonts);
    };
  }, [schedule]);

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      // Cleared, not just cancelled. `schedule` treats a non-zero frameRef as
      // "a draw is already pending", so leaving the id of a cancelled frame
      // behind wedges the preview permanently: every later schedule() returns
      // early and nothing is ever drawn. React runs effects twice on mount in
      // development, which makes that the *normal* path rather than an edge.
      frameRef.current = 0;
      void store.releaseAll();
    };
  }, [store]);

  return { canvasRef, containerRef, report, failed, store, redraw: schedule };
}

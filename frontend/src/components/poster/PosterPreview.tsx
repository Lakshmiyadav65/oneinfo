"use client";

import { useEffect, useState } from "react";
import type { PosterDesign } from "@/types/poster";
import { usePosterPreview } from "@/hooks/usePosterPreview";
import { describePoster, reportMessage } from "@/lib/poster/describe";
import { ErrorState } from "@/components/ui/ErrorState";
import { cn } from "@/lib/utils/cn";

/**
 * The poster, on screen, exactly as it will be in the file.
 *
 * The canvas is announced as one image with a generated description rather
 * than left silent, and the same description seeds the caption - so what a
 * screen-reader user hears here is close to what actually gets posted.
 *
 * Nothing on the canvas is focusable, and nothing should become focusable. The
 * form is the source of truth: every word on this poster came from a labelled
 * input the owner has already filled in, so the accessible path through this
 * screen does not run through the picture.
 */
export function PosterPreview({
  design,
  className,
}: {
  design: PosterDesign | null;
  className?: string;
}) {
  const { canvasRef, containerRef, report, failed, redraw } = usePosterPreview(design);
  const [status, setStatus] = useState("");

  const description = design ? describePoster(design) : "";
  const note = report ? reportMessage(report) : "";

  // Announced on a delay. Unlike the redraw, one announcement per keystroke is
  // unusable - a screen reader would never finish a sentence.
  useEffect(() => {
    const timer = setTimeout(() => setStatus(note), 1000);
    return () => clearTimeout(timer);
  }, [note]);

  if (failed) {
    return (
      <div className={className}>
        <ErrorState
          title="We couldn't draw this poster"
          description={failed}
          onRetry={redraw}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-muted/40",
          // The canvas sizes itself to this box, so the box must not collapse.
          "w-full"
        )}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={description || "Poster preview"}
          className="block w-full"
        >
          {description}
        </canvas>
      </div>

      {note && (
        <p className="mt-2 text-xs text-muted-foreground">{note}</p>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

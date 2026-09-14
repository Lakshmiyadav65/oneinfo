"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { PHOTO_STRENGTHS, type PhotoStrength, type PosterPhoto } from "@/types/poster";
import { fileToPhotoBlob } from "@/lib/poster/images";
import { getPhoto, putPhoto } from "@/lib/poster/photo-store";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";

const POSITIONS: { x: number; y: number; label: string }[] = [
  { x: 0.2, y: 0.2, label: "Top left" },
  { x: 0.5, y: 0.2, label: "Top" },
  { x: 0.8, y: 0.2, label: "Top right" },
  { x: 0.2, y: 0.5, label: "Left" },
  { x: 0.5, y: 0.5, label: "Centre" },
  { x: 0.8, y: 0.5, label: "Right" },
  { x: 0.2, y: 0.8, label: "Bottom left" },
  { x: 0.5, y: 0.8, label: "Bottom" },
  { x: 0.8, y: 0.8, label: "Bottom right" },
];

/**
 * The owner's own photo behind the poster.
 *
 * Their sweets, their shopfront, their new collection - the thing that makes a
 * poster unmistakably theirs, and something no gallery can provide. The
 * design's art and words stay on top; the photo only replaces the background.
 *
 * Where to aim the crop is a grid of nine buttons laid over the photo rather
 * than a drag handle. A photo almost never has the poster's shape, so something
 * gets cut, and "keep the top" is the whole decision - nine labelled buttons
 * make it in one tap, with a keyboard, and with a screen reader.
 */
export function PhotoPicker({
  photo,
  onChange,
}: {
  photo: PosterPhoto | null;
  onChange: (photo: PosterPhoto | null) => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const photoSrc = photo?.src ?? null;

  // The stored photo is a blob in IndexedDB; the preview needs a URL for it.
  useEffect(() => {
    if (!photoSrc) return;
    let url: string | null = null;
    let alive = true;
    getPhoto(photoSrc).then((blob) => {
      if (!alive || !blob) return;
      url = URL.createObjectURL(blob);
      setPreview(url);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photoSrc]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await fileToPhotoBlob(file);
      const src = await putPhoto(blob);
      onChange({
        src,
        // Keep the owner's earlier choices when they swap one photo for another.
        focus: photo?.focus ?? { x: 0.5, y: 0.5 },
        strength: photo?.strength ?? "balanced",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "That photo couldn't be used",
        description: err instanceof Error ? err.message : "Please try a different one.",
      });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const input = (
    <input
      ref={fileRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      className="sr-only"
      onChange={(e) => void pick(e.target.files?.[0])}
    />
  );

  if (!photo) {
    return (
      <div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg border border-dashed border-border px-3 py-3 text-left transition-colors",
            "hover:border-ring hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            busy && "opacity-60"
          )}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
            <ImagePlus aria-hidden="true" className="size-4 text-muted-foreground" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">
              {busy ? "Preparing your photo…" : "Use your own photo"}
            </span>
            <span className="block text-xs text-muted-foreground">
              Your product or shop, behind the words. The design&apos;s art stays on top.
            </span>
          </span>
        </button>
        {input}
      </div>
    );
  }

  const current = POSITIONS.find(
    (p) => Math.abs(p.x - photo.focus.x) < 0.01 && Math.abs(p.y - photo.focus.y) < 0.01
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="relative size-28 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
          {preview && (
            // An object URL for the owner's own blob: next/image cannot take one.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Your photo" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-3" role="group" aria-label="Which part of the photo to keep">
            {POSITIONS.map((p) => {
              const active = p === current;
              return (
                <button
                  key={p.label}
                  type="button"
                  aria-label={`Keep the ${p.label.toLowerCase()} of the photo`}
                  aria-pressed={active}
                  onClick={() => onChange({ ...photo, focus: { x: p.x, y: p.y } })}
                  className={cn(
                    "flex items-center justify-center transition-colors",
                    "hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  )}
                >
                  <span
                    className={cn(
                      "block rounded-full border-2 border-white shadow",
                      active ? "size-3 bg-primary" : "size-1.5 bg-white/70"
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs text-muted-foreground">
            Tap the part of the photo that matters most - it stays in view when the
            photo is cropped to the poster&apos;s shape.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isLoading={busy}
              onClick={() => fileRef.current?.click()}
            >
              <RefreshCw aria-hidden="true" className="size-3.5" />
              Replace
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <Trash2 aria-hidden="true" className="size-3.5" />
              Remove photo
            </Button>
          </div>
        </div>
      </div>

      <Segmented<PhotoStrength>
        label="Photo behind the words"
        value={photo.strength}
        options={PHOTO_STRENGTHS.map((s) => ({ value: s.value, label: s.label, hint: s.hint }))}
        onChange={(strength) => onChange({ ...photo, strength })}
      />
      {input}
    </div>
  );
}

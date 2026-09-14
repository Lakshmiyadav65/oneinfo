"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import type { PosterDesign, PosterSize } from "@/types/poster";
import { sizePixels } from "@/types/poster";
import { GALLERY_TAGS, type GalleryDesign, type GalleryTag } from "@/lib/poster/gallery";
import { renderThumbnail } from "@/lib/poster/export";
import { PosterImageStore } from "@/lib/poster/images";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils/cn";

/**
 * Designs to start from, each drawn with real content.
 *
 * The thumbnails are rendered by the same renderer as the poster itself, not
 * shipped as pictures. In the composer that means every design shows the
 * owner's *own* offer and shop name, so the choice is "which of these looks
 * like my poster" rather than "which stock sample do I like".
 *
 * Rendering is queued, one design per tick, and restarted only when the
 * content key changes - not on every keystroke. Twelve small renders are cheap;
 * twelve on every character typed would make the form feel sticky.
 */
export function DesignGallery({
  designs,
  makeDesign,
  renderKey,
  size = "square",
  selectedId,
  onSelect,
  hrefFor,
  layout = "grid",
  showFilters = false,
}: {
  designs: GalleryDesign[];
  makeDesign: (design: GalleryDesign) => PosterDesign;
  /** Changing this re-renders the thumbnails. */
  renderKey: string;
  size?: PosterSize;
  selectedId?: string | null;
  onSelect?: (design: GalleryDesign) => void;
  /** When set, cards are links instead of buttons. */
  hrefFor?: (design: GalleryDesign) => string;
  layout?: "grid" | "strip";
  showFilters?: boolean;
}) {
  const [tag, setTag] = useState<GalleryTag | "all">("all");
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [store] = useState(() => new PosterImageStore());

  // Read by the render queue, which must see the latest content without
  // restarting every time the parent re-renders with a new function identity.
  const latest = useRef({ designs, makeDesign });
  useEffect(() => {
    latest.current = { designs, makeDesign };
  });

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      for (const design of latest.current.designs) {
        if (cancelled) return;
        const url = await renderThumbnail(latest.current.makeDesign(design), 360, store);
        if (cancelled) return;
        if (url) setThumbs((current) => ({ ...current, [design.id]: url }));
        // Yield between renders so typing stays responsive while they run.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [renderKey, store]);

  useEffect(() => () => void store.releaseAll(), [store]);

  const shown = tag === "all" ? designs : designs.filter((d) => d.tags.includes(tag));
  const { width, height } = sizePixels(size);

  return (
    <div className="space-y-3">
      {showFilters && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter designs">
          {GALLERY_TAGS.map((option) => {
            const active = option.value === tag;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setTag(option.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:border-ring hover:bg-muted/50"
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      <div
        className={cn(
          layout === "grid"
            ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            : // A strip rather than a grid inside the composer: twelve designs in
              // rows would push the form a full screen down.
              "-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2"
        )}
      >
        {shown.map((design) => {
          const selected = design.id === selectedId;
          const body = (
            <>
              <span
                className="relative block w-full overflow-hidden rounded-lg bg-muted"
                style={{ aspectRatio: `${width} / ${height}` }}
              >
                {thumbs[design.id] ? (
                  // A data URL we just rendered ourselves: nothing for next/image
                  // to optimise, and it cannot take one anyway.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbs[design.id]}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <Skeleton className="absolute inset-0 h-full w-full rounded-none" />
                )}
                {selected && (
                  <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                    <Check aria-hidden="true" className="size-3.5" />
                  </span>
                )}
              </span>
              <span className="mt-1.5 block truncate text-xs font-medium text-foreground">
                {design.name}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {design.description}
              </span>
            </>
          );

          const className = cn(
            "block rounded-xl border p-1.5 text-left transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            layout === "strip" && "w-32 shrink-0 snap-start sm:w-36",
            selected ? "border-primary bg-primary/10" : "border-border hover:border-ring hover:bg-muted/40"
          );

          return hrefFor ? (
            <Link key={design.id} href={hrefFor(design)} className={className}>
              {body}
            </Link>
          ) : (
            <button
              key={design.id}
              type="button"
              aria-pressed={selected}
              aria-label={`${design.name}: ${design.description}`}
              onClick={() => onSelect?.(design)}
              className={className}
            >
              {body}
            </button>
          );
        })}
      </div>
    </div>
  );
}

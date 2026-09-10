"use client";

import { useState } from "react";
import { Clapperboard } from "lucide-react";
import { useAsyncData } from "@/hooks/useAsyncData";
import { listMedia } from "@/lib/api/media";
import { MediaTile } from "@/components/media/MediaTile";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import type { MediaItem, MediaKind } from "@/types/media";

type Filter = "all" | MediaKind;

/** One stable identity, so an empty list is not a new array each render. */
const EMPTY: MediaItem[] = [];

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All media" },
  { value: "video", label: "Finished videos" },
  { value: "clip", label: "Scene clips" },
];

/**
 * Everything the creator has generated, in one place.
 *
 * These files already existed, but each one was reachable only from the
 * scene card that made it, so a good shot was effectively lost the moment
 * they moved on to another project. Filtering happens on what is already
 * loaded rather than by re-fetching: the whole library is one small list of
 * rows, and a tab that goes to the network to hide half a list it already
 * has just feels slow.
 */
export default function MediaPage() {
  const media = useAsyncData(() => listMedia());
  const [filter, setFilter] = useState<Filter>("all");

  const items = media.status === "success" ? media.data : EMPTY;
  // Not memoised: the library is one small list of rows, and filtering it is
  // a single pass. Memoising a derived array whose source identity changes
  // every render buys nothing and costs a lint rule's worth of confusion.
  const shown = filter === "all" ? items : items.filter((item) => item.kind === filter);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Media</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every clip and finished video you&apos;ve generated. Play one here, or save
          it to use elsewhere.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter media">
        {FILTERS.map((option) => {
          const selected = option.value === filter;
          const count =
            option.value === "all"
              ? items.length
              : items.filter((item) => item.kind === option.value).length;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setFilter(option.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:border-ring hover:bg-muted/50"
              )}
            >
              {option.label}
              {media.status === "success" && (
                <span className="ml-1.5 tabular-nums text-muted-foreground">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {media.status === "loading" && (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="aspect-[9/16] w-full rounded-xl" />
          ))}
        </div>
      )}

      {media.status === "error" && (
        <ErrorState description={media.message} onRetry={media.retry} />
      )}

      {media.status === "success" && items.length === 0 && (
        <EmptyState
          icon={Clapperboard}
          title="Nothing generated yet"
          description="Clips and finished videos land here as soon as you generate them."
          action={
            <Button asChild>
              <a href="/create">Create a video</a>
            </Button>
          }
        />
      )}

      {media.status === "success" && items.length > 0 && shown.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing of that kind yet. Try another filter.
        </p>
      )}

      {shown.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((item) => (
            <MediaTile key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

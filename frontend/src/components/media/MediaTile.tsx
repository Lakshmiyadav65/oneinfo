"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, Play } from "lucide-react";
import { getMediaObjectUrl } from "@/lib/api/media";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils/cn";
import type { MediaItem } from "@/types/media";

/**
 * One generated file, as a tile that plays where it sits.
 *
 * The file is only fetched when the creator asks to play it. A library page
 * that eagerly downloaded every clip would pull tens of megabytes on load,
 * and most of those clips are not the one being looked for.
 */
export function MediaTile({ item }: { item: MediaItem }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const objectUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    []
  );

  async function load() {
    if (url || loading) return;
    setLoading(true);
    try {
      const next = await getMediaObjectUrl(item);
      objectUrl.current = next;
      setUrl(next);
    } catch {
      // Left as a tile that did not open. The list itself is still correct,
      // and a toast per failed tile would bury the page.
    } finally {
      setLoading(false);
    }
  }

  const duration =
    item.duration_seconds === null ? null : `${Math.round(item.duration_seconds)}s`;

  return (
    <figure className="group overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-ring">
      <div className="relative aspect-[9/16] bg-black">
        {url ? (
          <video src={url} controls autoPlay className="size-full object-contain" />
        ) : (
          <button
            type="button"
            onClick={() => void load()}
            aria-label={`Play ${item.label} from ${item.project_title}`}
            className="flex size-full items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            {loading ? (
              <Spinner className="size-6" />
            ) : (
              <span className="flex size-12 items-center justify-center rounded-full bg-white/10 text-white transition-transform group-hover:scale-110">
                <Play className="size-5 fill-current" aria-hidden="true" />
              </span>
            )}
          </button>
        )}

        <span
          className={cn(
            "pointer-events-none absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            item.kind === "video"
              ? "bg-primary text-primary-foreground"
              : "bg-black/60 text-white"
          )}
        >
          {item.kind === "video" ? "Video" : "Clip"}
        </span>

        {duration && (
          <span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] tabular-nums text-white">
            {duration}
          </span>
        )}
      </div>

      <figcaption className="space-y-1 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
          {/*
            Regenerating a scene keeps the old clip, so a project can hold
            several tiles all called "Scene 1". The date is what tells them
            apart, and without it the library is a row of identical twins.
          */}
          <time
            dateTime={item.created_at}
            className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
          >
            {new Date(item.created_at).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
            })}
          </time>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/projects/${item.project_id}`}
            className="truncate text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {item.project_title}
          </Link>
          {/*
            Only once the file is in hand. A download link pointing at the
            auth-gated route would 401, because a plain anchor cannot attach
            the Authorization header either.
          */}
          {url && (
            <a
              href={url}
              download={`${item.label.replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")}.mp4`}
              className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Download className="size-3.5" aria-hidden="true" />
              Save
            </a>
          )}
        </div>
      </figcaption>
    </figure>
  );
}

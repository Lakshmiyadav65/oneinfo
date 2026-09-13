"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { usePosterLibrary } from "@/hooks/usePosterLibrary";
import { PosterComposer } from "@/components/poster/PosterComposer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * A saved poster, reopened.
 *
 * The "not here" case is the one worth designing for: these live on one
 * device, so following a link on a different phone, or after clearing site
 * data, is the normal way to arrive at a missing poster rather than an error.
 * It is said plainly instead of as a failure.
 */
export function PosterView({ postId }: { postId: string }) {
  const library = usePosterLibrary();
  const post = library.status === "success" ? library.data.find((p) => p.id === postId) : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/posters"
          className="inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          Your posters
        </Link>
        <h2 className="mt-2 text-xl font-semibold text-foreground">
          {post?.design.content.headline || "Poster"}
        </h2>
      </div>

      {library.status === "loading" && <Skeleton className="h-96 w-full rounded-xl" />}

      {library.status === "error" && (
        <ErrorState description={library.message} onRetry={library.retry} />
      )}

      {library.status === "success" && !post && (
        <EmptyState
          title="That poster isn't on this device"
          description="Posters are saved in this browser, so one made on another phone or before site data was cleared won't be here."
          action={
            <Button asChild>
              <Link href="/posters/new">Make a new one</Link>
            </Button>
          }
        />
      )}

      {post && <PosterComposer postId={post.id} />}
    </div>
  );
}

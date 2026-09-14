"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { OccasionKind, PosterBrief } from "@/types/poster";
import { occasionById } from "@/lib/poster/occasions";
import { galleryDesignById } from "@/lib/poster/gallery";
import { PosterComposer, type ComposerPrefill } from "@/components/poster/PosterComposer";

const KINDS: OccasionKind[] = ["offer", "festival", "announcement", "civil_day", "business_beat"];

/**
 * A new poster, optionally started from a design, a festival or the calendar.
 *
 * The starting point arrives as query parameters rather than as state handed
 * across a navigation, so the link survives a refresh and can be shared or
 * bookmarked - "make the Diwali poster in Diya Glow" is a URL.
 *
 * Only what the link actually says goes into the prefill. Anything invented
 * here would look deliberate to the composer and overwrite a draft the owner
 * had half-finished.
 */
export function NewPosterView({
  occasionId,
  subject,
  kind,
  designId,
}: {
  occasionId: string | null;
  subject: string | null;
  kind: string | null;
  designId: string | null;
}) {
  const occasion = occasionId ? occasionById(occasionId) : null;
  const design = galleryDesignById(designId);
  const linkedKind = KINDS.includes(kind as OccasionKind) ? (kind as OccasionKind) : null;

  const brief: Partial<PosterBrief> = {};
  if (occasion) {
    brief.occasion_id = occasion.id;
    brief.subject = occasion.name;
    brief.kind = linkedKind ?? "festival";
  } else if (design && !linkedKind) {
    // Picked from the gallery: open looking like the thumbnail that was tapped,
    // sample offer included. It is a template - every word is there to be
    // changed - and an empty form under a design full of example text feels
    // like the click did not work.
    brief.kind = design.sample.kind;
    brief.occasion_id = design.sample.occasionId;
    brief.subject = design.sample.subject;
    brief.offer = design.sample.offer;
    brief.cta = design.sample.cta;
  } else if (linkedKind) {
    brief.kind = linkedKind;
  }
  if (subject) brief.subject = subject;

  const prefill: ComposerPrefill = {
    brief: Object.keys(brief).length ? brief : undefined,
    designId: design?.id ?? null,
  };

  const title = occasion
    ? `${occasion.name} poster`
    : design
      ? `${design.name} poster`
      : "Make a poster";

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
        <h2 className="mt-2 text-xl font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a design, fill in your offer, and it&apos;s ready to post.
        </p>
      </div>

      <PosterComposer postId={null} prefill={prefill} />
    </div>
  );
}

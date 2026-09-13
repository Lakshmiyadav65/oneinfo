"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { OccasionKind, PosterBrief, PosterStyle } from "@/types/poster";
import { occasionById } from "@/lib/poster/occasions";
import { PosterComposer } from "@/components/poster/PosterComposer";

const KINDS: OccasionKind[] = ["offer", "festival", "announcement", "civil_day", "business_beat"];

/**
 * A new poster, optionally pre-filled from the calendar.
 *
 * The prefill arrives as query parameters rather than as state handed across a
 * navigation, so the link survives a refresh and can be shared or bookmarked -
 * "make the Diwali poster" is a URL.
 */
export function NewPosterView({
  occasionId,
  subject,
  date,
  kind,
}: {
  occasionId: string | null;
  subject: string | null;
  date: string | null;
  kind: string | null;
}) {
  const occasion = occasionId ? occasionById(occasionId) : null;

  const prefill: Partial<PosterBrief> & { style?: PosterStyle } = {
    ...(occasion ? { occasion_id: occasion.id, subject: occasion.name } : {}),
    ...(subject ? { subject } : {}),
    ...(date ? { valid_until: null } : {}),
    // An occasion picked off the calendar is a festival offer unless the link
    // said otherwise; everything else opens on the offer form.
    kind: (KINDS.includes(kind as OccasionKind) ? (kind as OccasionKind) : occasion ? "festival" : "offer"),
    ...(occasion ? { } : {}),
  };

  if (occasion) prefill.style = occasion.default_style;

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
          {occasion ? `${occasion.name} poster` : "Make a poster"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Fill in the offer, pick a look, and it&apos;s ready to post.
        </p>
      </div>

      <PosterComposer postId={null} prefill={prefill} />
    </div>
  );
}

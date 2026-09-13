"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { categoryLabel } from "@/types/poster";
import {
  OCCASIONS_SOURCE,
  monthName,
  needsDateRefresh,
} from "@/lib/poster/occasions";
import { useBrandProfile } from "@/hooks/useBrandProfile";
import { usePosterLibrary } from "@/hooks/usePosterLibrary";
import { MonthAgenda } from "@/components/poster/MonthAgenda";
import { MonthGrid } from "@/components/poster/MonthGrid";
import { PosterTabs } from "@/components/poster/PosterTabs";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";

function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * What to post this month, and when.
 *
 * The month lives in the URL so a particular month can be linked to and
 * survives a refresh. It is only defaulted here, after mount, because the
 * server has no clock that agrees with the viewer's.
 */
export function CalendarView({ month }: { month: string | null }) {
  const library = usePosterLibrary();
  const { brand, loaded } = useBrandProfile();
  const [today, setToday] = useState("");

  // Read after mount: the viewer's clock is the only one that matters here,
  // and the server does not have it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(new Date().toISOString().slice(0, 10));
  }, []);

  const fallback = today ? today.slice(0, 7) : null;
  const active = month ?? fallback;

  if (!active || !loaded) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  const year = Number(active.slice(0, 4));
  const monthNumber = Number(active.slice(5, 7));
  const prev = shiftMonth(year, monthNumber, -1);
  const next = shiftMonth(year, monthNumber, 1);
  const pad = (n: number) => String(n).padStart(2, "0");

  const posts = library.status === "success" ? library.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Plan the month</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Festivals your customers care about, plus a few ideas for the quiet weeks.
          Tap any day to make the poster.
        </p>
      </div>

      <PosterTabs />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Previous month" asChild>
          <Link href={`/posters/calendar?m=${prev.year}-${pad(prev.month)}`}>
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Link>
        </Button>
        <h3 className="text-sm font-semibold text-foreground">
          {monthName(monthNumber)} {year}
        </h3>
        <Button variant="ghost" size="icon" aria-label="Next month" asChild>
          <Link href={`/posters/calendar?m=${next.year}-${pad(next.month)}`}>
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
        {fallback && active !== fallback && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/posters/calendar?m=${fallback}`}>Today</Link>
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          Ideas for {categoryLabel(brand.category).toLowerCase()}
        </span>
      </div>

      {needsDateRefresh(year) && (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            Festival dates for {year} haven&apos;t been added yet — they move every year and
            are copied from a panchangam rather than calculated, so we&apos;d rather leave
            them out than guess. Fixed days like Independence Day and New Year still
            appear below.
          </CardContent>
        </Card>
      )}

      {library.status === "error" ? (
        <ErrorState description={library.message} onRetry={library.retry} />
      ) : (
        <>
          <MonthGrid
            year={year}
            month={monthNumber}
            category={brand.category}
            posts={posts}
            today={today}
          />
          <MonthAgenda
            year={year}
            month={monthNumber}
            category={brand.category}
            posts={posts}
          />
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Festival dates from {OCCASIONS_SOURCE}. Regional practice varies — check locally
        before you post.
      </p>
    </div>
  );
}

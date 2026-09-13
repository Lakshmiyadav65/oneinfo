"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";
import type { BusinessCategory, PosterPost } from "@/types/poster";
import {
  beatsForMonth,
  monthName,
  occasionsForMonth,
  shortDate,
  undatedOccasionsForMonth,
} from "@/lib/poster/occasions";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";

/**
 * The month as a list.
 *
 * This is the primary way the calendar is used on a phone, and a useful second
 * reading of it everywhere else - a grid tells you the shape of the month, a
 * list tells you what to do next.
 *
 * It also carries the festivals whose dates we could not pin. Those are shown
 * rather than dropped: knowing Bathukamma is coming and having to set the day
 * yourself is far better than a calendar that quietly omits it, and much
 * better than one that guesses.
 */
export function MonthAgenda({
  year,
  month,
  category,
  posts,
}: {
  year: number;
  month: number;
  category: BusinessCategory;
  posts: PosterPost[];
}) {
  const occasions = occasionsForMonth(year, month, category);
  const beats = beatsForMonth(year, month, category);
  const undated = undatedOccasionsForMonth(year, month, category);

  const postByDate = new Map(posts.filter((p) => p.occasion_date).map((p) => [p.occasion_date!, p]));

  const rows = [
    ...occasions.map((o) => ({
      key: `o-${o.occasion.id}`,
      date: o.date,
      name: o.occasion.name,
      kind: "occasion" as const,
      href: `/posters/new?occasion=${o.occasion.id}&date=${o.date}`,
    })),
    ...beats.map((b) => ({
      key: `b-${b.beat.id}-${b.date}`,
      date: b.date,
      name: b.beat.name,
      kind: "beat" as const,
      href: `/posters/new?subject=${encodeURIComponent(b.beat.name)}&date=${b.date}`,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h3 className="text-sm font-semibold text-foreground">
          {monthName(month)} {year}, day by day
        </h3>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing scheduled this month.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {rows.map((row) => {
              const existing = postByDate.get(row.date);
              return (
                <li key={row.key}>
                  <Link
                    href={existing ? `/posters/${existing.id}` : row.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 transition-colors",
                      "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    )}
                  >
                    <span className="w-14 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                      {shortDate(row.date)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{row.name}</span>
                    {row.kind === "beat" && <Badge>Idea</Badge>}
                    {existing ? (
                      <Badge variant="success">Made</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Make one</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {undated.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarClock aria-hidden="true" className="size-4 text-muted-foreground" />
            Dates that move
          </h3>
          <p className="text-xs text-muted-foreground">
            These fall in {monthName(month)}, but the exact day shifts each year and we
            haven&apos;t confirmed it. Check locally, then set the date yourself.
          </p>
          <ul className="divide-y divide-border rounded-lg border border-dashed border-border">
            {undated.map((occasion) => (
              <li key={occasion.id}>
                <Link
                  href={`/posters/new?occasion=${occasion.id}`}
                  className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{occasion.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {occasion.window?.note}
                    </span>
                  </span>
                  <Badge variant="warning">Date varies</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

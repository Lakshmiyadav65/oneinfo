"use client";

import Link from "next/link";
import type { BusinessCategory, PosterPost } from "@/types/poster";
import { beatsForMonth, isoDate, occasionsForMonth } from "@/lib/poster/occasions";
import { cn } from "@/lib/utils/cn";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * The month as a grid.
 *
 * Occasions sit in the foreground and recurring business beats behind them in
 * muted type, because a festival is a fact about the world and a beat is only
 * a suggestion. A day that already has a poster gets a dot and links to it
 * rather than to a new one.
 *
 * On a phone this shrinks to numbers and dots, and the agenda list below
 * becomes the thing people actually use. A seven-column grid with readable
 * chips does not exist at 360px, and pretending otherwise is how a calendar
 * screen fails for the person it was built for.
 */
export function MonthGrid({
  year,
  month,
  category,
  posts,
  today,
}: {
  year: number;
  month: number;
  category: BusinessCategory;
  posts: PosterPost[];
  today: string;
}) {
  const occasions = occasionsForMonth(year, month, category);
  const beats = beatsForMonth(year, month, category);

  const total = new Date(year, month, 0).getDate();
  const leading = new Date(year, month - 1, 1).getDay();
  const cells = Array.from({ length: leading + total }, (_, i) =>
    i < leading ? null : i - leading + 1
  );

  const postByDate = new Map<string, PosterPost>();
  for (const post of posts) {
    if (post.occasion_date) postByDate.set(post.occasion_date, post);
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2" aria-hidden="true">
        {WEEKDAYS.map((day, i) => (
          <div key={i} className="px-1 pb-1 text-center text-[10px] font-medium text-muted-foreground">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {cells.map((day, index) => {
          if (day === null) return <div key={`pad-${index}`} />;

          const date = isoDate(year, month, day);
          const dayOccasions = occasions.filter((o) => o.day === day);
          const dayBeats = beats.filter((b) => b.day === day);
          const existing = postByDate.get(date);
          const isToday = date === today;

          const occasion = dayOccasions[0];
          const href = existing
            ? `/posters/${existing.id}`
            : `/posters/new?${new URLSearchParams({
                ...(occasion ? { occasion: occasion.occasion.id } : {}),
                ...(dayBeats[0] && !occasion ? { subject: dayBeats[0].beat.name } : {}),
                date,
              }).toString()}`;

          return (
            <Link
              key={date}
              href={href}
              className={cn(
                "flex min-h-16 flex-col rounded-lg border p-1 text-left transition-colors sm:min-h-24 sm:p-1.5",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                dayOccasions.length > 0
                  ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                  : "border-border hover:border-ring hover:bg-muted/40"
              )}
            >
              <span className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-[11px] font-medium tabular-nums",
                    isToday
                      ? "rounded-full bg-primary px-1.5 text-primary-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {day}
                </span>
                {existing && (
                  <span
                    aria-label="A poster is saved for this day"
                    className="size-1.5 rounded-full bg-success"
                  />
                )}
              </span>

              {/* Names are hidden on the narrowest screens; the agenda below
                  carries them there. */}
              <span className="mt-0.5 hidden flex-col gap-0.5 sm:flex">
                {dayOccasions.slice(0, 1).map((o) => (
                  <span key={o.occasion.id} className="truncate text-[10px] font-medium text-foreground">
                    {o.occasion.name}
                  </span>
                ))}
                {dayBeats.slice(0, 1).map((b) => (
                  <span key={b.beat.id} className="truncate text-[10px] text-muted-foreground">
                    {b.beat.name}
                  </span>
                ))}
              </span>

              {/* On a phone, a dot is all that fits - but the day still has to
                  say that something is on it. */}
              <span className="mt-auto flex gap-0.5 sm:hidden">
                {dayOccasions.length > 0 && <span className="size-1.5 rounded-full bg-primary" />}
                {dayBeats.length > 0 && <span className="size-1.5 rounded-full bg-muted-foreground/50" />}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

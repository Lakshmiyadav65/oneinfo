"use client";

import { cn } from "@/lib/utils/cn";

/**
 * One occasion, as a chip: what it is and when it is.
 *
 * The date is on the chip rather than in a tooltip because it is half the
 * value - knowing Ganesh Chaturthi is in three days is the thing that makes
 * someone post at all.
 */
export function OccasionChip({
  label,
  meta,
  selected,
  uncertain,
  onSelect,
}: {
  label: string;
  meta?: string;
  selected?: boolean;
  /** The date moves and we have not pinned it. Shown, never hidden. */
  uncertain?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "rounded-full border px-3 py-1.5 text-left text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/15 text-foreground"
          : "border-border text-muted-foreground hover:border-ring hover:bg-muted/50"
      )}
    >
      <span className="block whitespace-nowrap">{label}</span>
      {meta && (
        <span
          className={cn(
            "block text-[10px] font-normal",
            uncertain ? "text-warning" : "text-muted-foreground/80"
          )}
        >
          {meta}
        </span>
      )}
    </button>
  );
}

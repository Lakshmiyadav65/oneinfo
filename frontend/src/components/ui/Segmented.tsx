"use client";

import { cn } from "@/lib/utils/cn";

/**
 * A row of mutually exclusive choices, all of them visible.
 *
 * Used where the options are few and the difference between them matters
 * enough to read at a glance - what a run costs, what shape a video is
 * exported at. A dropdown would hide exactly the comparison being made.
 *
 * `hint` is the second line: the price, the pixel size, whatever makes the
 * choice concrete rather than a name to guess at.
 */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div
        role="group"
        aria-label={label}
        className="flex flex-wrap gap-1 rounded-lg border border-border p-1"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                // Selection is a filled background plus weight, not colour
                // alone, so it survives a greyscale screenshot.
                selected
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
                disabled && "cursor-not-allowed opacity-50"
              )}
            >
              <span className="block whitespace-nowrap">{option.label}</span>
              {option.hint && (
                <span
                  className={cn(
                    "block text-[10px] font-normal tabular-nums",
                    selected ? "text-primary-foreground/80" : "text-muted-foreground"
                  )}
                >
                  {option.hint}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

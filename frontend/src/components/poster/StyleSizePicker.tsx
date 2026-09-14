"use client";

import { POSTER_SIZES, POSTER_STYLES, type PosterSize, type PosterStyle } from "@/types/poster";
import { styleSwatch } from "@/lib/poster/styles";
import { Segmented } from "@/components/ui/Segmented";
import { cn } from "@/lib/utils/cn";

/**
 * How it looks, and where it is going.
 *
 * The styles are shown as swatches rather than named in a dropdown, because
 * "Festive" and "Traditional" mean nothing until you can see the difference -
 * and the difference is the entire choice being made.
 */
export function StyleSizePicker({
  style,
  size,
  onStyle,
  onSize,
}: {
  style: PosterStyle;
  size: PosterSize;
  onStyle: (style: PosterStyle) => void;
  onSize: (size: PosterSize) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Colours</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Poster colours">
          {POSTER_STYLES.map((option) => {
            const swatch = styleSwatch(option.value);
            const selected = option.value === style;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onStyle(option.value)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-ring hover:bg-muted/50"
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-7 shrink-0 rounded-md border border-black/10"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${swatch.from}, ${swatch.to})`,
                  }}
                >
                  <span
                    className="mx-auto mt-2.5 block h-1.5 w-3.5 rounded-full"
                    style={{ backgroundColor: swatch.ink }}
                  />
                </span>
                <span>
                  <span className="block text-xs font-medium text-foreground">{option.label}</span>
                  <span className="block text-[10px] text-muted-foreground">{option.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Segmented<PosterSize>
        label="Where are you posting it?"
        value={size}
        options={POSTER_SIZES.map((s) => ({ value: s.value, label: s.label, hint: s.hint }))}
        onChange={onSize}
      />
    </div>
  );
}

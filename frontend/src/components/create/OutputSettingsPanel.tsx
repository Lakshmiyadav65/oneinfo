"use client";

import { cn } from "@/lib/utils/cn";
import type {
  AspectRatio,
  ModelTier,
  OutputSettings,
  Resolution,
  Takes,
} from "@/types/output-settings";
import type { Storyboard } from "@/types/storyboard";
import { storyboardCost, storyboardCostUnder } from "@/lib/workflow/scene-cost";

/**
 * What the video is generated at, as segmented controls with the price of
 * each option next to it.
 *
 * Modelled on the panel Google Flow puts beside its generate button, with
 * one difference that matters: every option here is priced against this
 * creator's actual storyboard, not against an abstract credit balance. The
 * point of the panel is that these are the four decisions that change the
 * bill, so hiding what they cost would defeat it.
 *
 * Clip length is not here. Flow offers it, but a scene's length belongs to
 * the scene, where it is weighed against what that scene has to say - a
 * second control on this panel would silently overwrite all of them.
 */

function Segmented<T extends string | number>({
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

export function OutputSettingsPanel({
  output,
  storyboard,
  disabled = false,
  showTotal = true,
  onChange,
}: {
  output: OutputSettings;
  /** Priced against this. Null before one exists, which hides the numbers. */
  storyboard: Storyboard | null;
  disabled?: boolean;
  /** Off where the caller already shows the price of the action itself. */
  showTotal?: boolean;
  onChange: (output: OutputSettings) => void;
}) {
  // Each option is priced by asking what the whole storyboard would cost
  // with only that field changed, so the number under a button is the real
  // consequence of pressing it rather than a rate the creator has to apply.
  const priceOf = (change: Partial<OutputSettings>) =>
    storyboard ? storyboardCostUnder(storyboard, output, change) : undefined;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Output
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          How this video is generated. Each choice changes what the run costs.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Segmented<AspectRatio>
          label="Shape"
          value={output.aspect_ratio}
          disabled={disabled}
          onChange={(aspect_ratio) => onChange({ ...output, aspect_ratio })}
          options={[
            { value: "9:16", label: "9:16 Vertical" },
            { value: "16:9", label: "16:9 Wide" },
          ]}
        />

        <Segmented<Resolution>
          label="Resolution"
          value={output.resolution}
          disabled={disabled}
          onChange={(resolution) => onChange({ ...output, resolution })}
          options={[
            { value: "720p", label: "720p", hint: priceOf({ resolution: "720p" }) },
            { value: "1080p", label: "1080p", hint: priceOf({ resolution: "1080p" }) },
          ]}
        />

        <Segmented<ModelTier>
          label="Quality"
          value={output.model_tier}
          disabled={disabled}
          onChange={(model_tier) => onChange({ ...output, model_tier })}
          options={[
            { value: "lite", label: "Standard", hint: priceOf({ model_tier: "lite" }) },
            { value: "fast", label: "Higher", hint: priceOf({ model_tier: "fast" }) },
          ]}
        />

        <Segmented<Takes>
          label="Takes of each scene"
          value={output.takes}
          disabled={disabled}
          onChange={(takes) => onChange({ ...output, takes })}
          options={([1, 2, 3, 4] as Takes[]).map((takes) => ({
            value: takes,
            label: `x${takes}`,
            hint: priceOf({ takes }),
          }))}
        />
      </div>

      {storyboard && showTotal && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Estimated {storyboardCost(storyboard, output)} to generate
          </span>{" "}
          — a forecast from list prices, not a quote. Your Google Cloud bill is
          the authority.
        </p>
      )}

      {!showTotal && (
        <p className="text-xs text-muted-foreground">
          Prices are a forecast from list prices, not a quote. Your Google Cloud
          bill is the authority.
        </p>
      )}

      {/*
        Said plainly because "Higher" reads like it should apply everywhere.
        A scene with the creator in frame cannot use the cheaper model at all:
        it rejects reference images outright.
      */}
      <p className="text-xs text-muted-foreground">
        Scenes with you on camera always use the higher-quality model, whichever
        setting is chosen here.
      </p>
    </div>
  );
}

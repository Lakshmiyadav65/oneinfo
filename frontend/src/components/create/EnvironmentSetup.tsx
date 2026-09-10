"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { SavedSetups } from "@/components/create/SavedSetups";
import { cn } from "@/lib/utils/cn";
import {
  BACKGROUNDS,
  CAMERA_ANGLES,
  CAMERA_FRAMINGS,
  CAMERA_MOVEMENTS,
  ENVIRONMENT_PRESETS,
  LIGHTINGS,
  SUBJECTS,
  VISUAL_STYLES,
  presetDescription,
  presetLabel,
  type EnvironmentPreset,
  type SceneEnvironment,
} from "@/types/environment";

/**
 * The filming setup for one scene, or for a whole project.
 *
 * Compact on purpose. A creator picks a preset and moves on; the controls
 * behind it exist for the times that is not enough, and stay folded away
 * until then. What a preset means is decided by the server, so choosing one
 * here sends the preset and lets the defaults come back.
 */

function Select<T extends string>({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className={cn(
          "h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function EnvironmentSetup({
  idPrefix,
  environment,
  disabled = false,
  showSaved = false,
  onPresetChange,
  onChange,
}: {
  /** Namespaces the control ids, since several of these render per page. */
  idPrefix: string;
  environment: SceneEnvironment;
  disabled?: boolean;
  /** Offers the creator's saved setups, and the option to keep this one. */
  showSaved?: boolean;
  /** A preset chip: the server rebuilds the controls behind it. */
  onPresetChange: (preset: EnvironmentPreset) => void;
  /** One control nudged: everything else stays as it is. */
  onChange: (environment: SceneEnvironment) => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function set<K extends keyof SceneEnvironment>(key: K, value: SceneEnvironment[K]) {
    onChange({ ...environment, [key]: value });
  }

  /**
   * The free-text fields are uncontrolled and read on blur.
   *
   * Controlled, they would fire a request per keystroke, and each request
   * rewrites the scene's visual description. Mirroring them into local state
   * instead needs an effect to re-sync when the value changes elsewhere,
   * which is the pattern React asks you not to write. `key` is the sanctioned
   * way to reset an uncontrolled field, and it only changes on a real edit -
   * by which point focus has already left.
   *
   * That key is written on each field rather than returned from here. React
   * reads it off the JSX element itself, and one arriving inside a spread is
   * dropped with a warning - which left these fields never resetting at all
   * when a preset or a saved setup replaced the value underneath them.
   */
  function textField(field: "custom_setup" | "custom_background" | "additional_requirements") {
    return {
      defaultValue: environment[field],
      onBlur: (event: React.FocusEvent<HTMLTextAreaElement>) => {
        if (event.target.value !== environment[field]) set(field, event.target.value);
      },
    };
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Environment &amp; Setup
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Choose how this should look. You don&apos;t need to write a prompt.
        </p>
      </div>

      {/*
        Saved setups first, because reusing one is the shortest path through
        this panel. Only shown where reuse makes sense - a single scene's
        override is not a look worth keeping under the creator's name.
      */}
      {showSaved && (
        <SavedSetups environment={environment} disabled={disabled} onApply={onChange} />
      )}

      {/*
        Wraps on a narrow screen rather than scrolling: a chip that is off the
        edge of a card is a chip nobody finds.
      */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Environment preset">
        {ENVIRONMENT_PRESETS.map((preset) => {
          const selected = environment.preset === preset.value;
          return (
            <button
              key={preset.value}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              title={preset.description}
              onClick={() => onPresetChange(preset.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                // Selection carries a filled border and a check, not colour
                // alone, so it survives a colour-blind reader and a
                // greyscale screenshot.
                selected
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:border-ring hover:bg-muted/50",
                disabled && "cursor-not-allowed opacity-50"
              )}
            >
              <span aria-hidden="true">{preset.icon}</span>
              {preset.label}
              {selected && <span aria-hidden="true">✓</span>}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          Selected: {presetLabel(environment.preset)}
        </span>
        {presetDescription(environment.preset) && ` — ${presetDescription(environment.preset)}`}
      </p>

      {environment.preset === "custom" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-custom-setup`}>Describe your setup</Label>
          <Textarea
            key={environment.custom_setup}
            id={`${idPrefix}-custom-setup`}
            rows={2}
            disabled={disabled}
            placeholder="Standing in a modern Bengaluru startup office with a large glass wall, warm evening light, plants in the background and a laptop on the desk."
            {...textField("custom_setup")}
          />
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
          aria-controls={`${idPrefix}-advanced`}
          className="flex items-center gap-1 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Advanced setup
          <ChevronDown
            className={cn("size-3.5 transition-transform", advancedOpen && "rotate-180")}
            aria-hidden="true"
          />
        </button>

        {advancedOpen && (
          <div
            id={`${idPrefix}-advanced`}
            className="mt-3 grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2"
          >
            <Select
              id={`${idPrefix}-background`}
              label="Background"
              value={environment.background}
              options={BACKGROUNDS}
              disabled={disabled}
              onChange={(v) => set("background", v)}
            />
            <Select
              id={`${idPrefix}-framing`}
              label="Camera framing"
              value={environment.camera_framing}
              options={CAMERA_FRAMINGS}
              disabled={disabled}
              onChange={(v) => set("camera_framing", v)}
            />
            <Select
              id={`${idPrefix}-angle`}
              label="Camera angle"
              value={environment.camera_angle}
              options={CAMERA_ANGLES}
              disabled={disabled}
              onChange={(v) => set("camera_angle", v)}
            />
            <Select
              id={`${idPrefix}-movement`}
              label="Camera movement"
              value={environment.camera_movement}
              options={CAMERA_MOVEMENTS}
              disabled={disabled}
              onChange={(v) => set("camera_movement", v)}
            />
            <Select
              id={`${idPrefix}-lighting`}
              label="Lighting"
              value={environment.lighting}
              options={LIGHTINGS}
              disabled={disabled}
              onChange={(v) => set("lighting", v)}
            />
            <Select
              id={`${idPrefix}-style`}
              label="Visual style"
              value={environment.visual_style}
              options={VISUAL_STYLES}
              disabled={disabled}
              onChange={(v) => set("visual_style", v)}
            />
            <Select
              id={`${idPrefix}-subject`}
              label="Subject"
              value={environment.subject}
              options={SUBJECTS}
              disabled={disabled}
              onChange={(v) => set("subject", v)}
            />

            {environment.background === "custom" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`${idPrefix}-custom-background`}>Describe background</Label>
                <Textarea
                  key={environment.custom_background}
                  id={`${idPrefix}-custom-background`}
                  rows={2}
                  disabled={disabled}
                  placeholder="A large glass wall with the city lit up behind it"
                  {...textField("custom_background")}
                />
              </div>
            )}

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${idPrefix}-extra`}>Additional visual requirements</Label>
              <Textarea
                key={environment.additional_requirements}
                id={`${idPrefix}-extra`}
                rows={2}
                disabled={disabled}
                placeholder="Anything specific you want included? e.g. keep a laptop on the desk and a small plant in the background."
                {...textField("additional_requirements")}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

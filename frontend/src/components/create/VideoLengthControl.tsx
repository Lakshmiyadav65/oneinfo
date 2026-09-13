"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/Segmented";
import { useToast } from "@/components/ui/Toast";
import { setOutputSettings } from "@/lib/api/projects";
import type { OutputSettings, TargetDuration } from "@/types/output-settings";

/**
 * How long the finished video should run.
 *
 * Lives on the storyboard step because that is the only place it does
 * anything. The length is spent when the storyboard is written - it decides
 * how many scenes get written and how many words each one carries - so a
 * copy of this control beside the generate button was showing a live
 * setting at the one moment it could no longer change the outcome.
 *
 * Saved on click rather than behind a Save button. There is nothing to
 * batch it with, and a length that is set but not stored would be spent by
 * the next regenerate as if it had never been touched.
 */

const OPTIONS = [15, 30, 45, 60] as const;
// Segmented values are strings or numbers, and "Auto" is the absence of one.
// 0 stands in for it here and is translated back at the edge.
const AUTO = 0;

export function VideoLengthControl({
  projectId,
  output,
  actualSeconds,
  disabled = false,
  onSaved,
}: {
  projectId: string;
  output: OutputSettings;
  /** What the storyboard on screen actually runs to, so the two can be compared. */
  actualSeconds: number;
  disabled?: boolean;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const target = output.target_duration_seconds;

  async function choose(seconds: number) {
    const next = (seconds || null) as TargetDuration;
    if (next === target) return;
    setSaving(true);
    try {
      await setOutputSettings(projectId, { ...output, target_duration_seconds: next });
      onSaved();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't save the video length",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <Segmented<number>
        label="Video length"
        value={target ?? AUTO}
        disabled={disabled || saving}
        onChange={(seconds) => void choose(seconds)}
        options={[
          { value: AUTO, label: "Auto" },
          ...OPTIONS.map((seconds) => ({ value: seconds, label: `${seconds}s` })),
        ]}
      />
      <p className="text-xs text-muted-foreground">
        The whole video, not one clip — clips are only ever 4, 6 or 8 seconds
        and the video is all of them end to end. Takes effect on the next{" "}
        <span className="text-foreground">Regenerate Storyboard</span>; this one
        runs {actualSeconds}s.
      </p>
    </div>
  );
}

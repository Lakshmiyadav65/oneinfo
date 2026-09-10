"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Segmented";
import { useToast } from "@/components/ui/Toast";
import { useAsyncData } from "@/hooks/useAsyncData";
import { exportVideo, getStitchReadiness } from "@/lib/api/generation";
import type { ExportFormat, GenerationJob } from "@/types/generation";
import type { AspectRatio, Resolution } from "@/types/output-settings";

/**
 * The finished video, framed for wherever it is going next.
 *
 * Free, and the card says so. Exporting stitches the clips already on hand
 * and never calls the video provider, so a creator can export the same cut
 * for Reels, for YouTube and for a square feed without thinking about it.
 *
 * The frame belongs to the export and not to the project. Choosing YouTube
 * here says where this file is going; it does not change what the next scene
 * is generated as, which is the part that costs money.
 */

const FORMATS: { value: ExportFormat; label: string; where: string }[] = [
  { value: "9:16", label: "9:16", where: "Reels, TikTok, Shorts" },
  { value: "16:9", label: "16:9", where: "YouTube" },
  { value: "1:1", label: "1:1", where: "Square feed" },
];

/** The pixel size each frame lands at, so the choice is concrete. */
function sizeOf(format: ExportFormat, resolution: Resolution): string {
  const short = resolution === "720p" ? 720 : 1080;
  const long = Math.round((short * 16) / 9);
  if (format === "1:1") return `${short}×${short}`;
  return format === "9:16" ? `${short}×${long}` : `${long}×${short}`;
}

export function ExportVideo({
  projectId,
  generatedAs,
  disabled = false,
  refreshToken = 0,
  onStarted,
}: {
  projectId: string;
  /** The shape the clips were generated at, to warn about bars. */
  generatedAs: AspectRatio;
  disabled?: boolean;
  /** Bumped when scenes move in or out of the cut, to re-ask readiness. */
  refreshToken?: number;
  /** Handed the started job, so the caller's poller picks it straight up. */
  onStarted: (job: GenerationJob) => void;
}) {
  const { toast } = useToast();
  const readiness = useAsyncData(
    () => getStitchReadiness(projectId),
    [projectId, refreshToken]
  );
  const [format, setFormat] = useState<ExportFormat>(generatedAs);
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [busy, setBusy] = useState(false);

  if (readiness.status !== "success") return null;

  const { scenes_total: total, scenes_ready: ready, missing_scenes: missing } = readiness.data;

  // Nothing to export yet. Said by the generate card above rather than by a
  // second empty state under it.
  if (total === 0 || ready === 0) return null;

  async function handleExport() {
    setBusy(true);
    try {
      onStarted(await exportVideo(projectId, format, resolution));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't export the video",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  // Fitted and padded, never stretched. Worth saying before the click: a
  // vertical cut exported for YouTube is correct and still has bars, and a
  // creator who expected a crop should find that out here.
  const reframed = format !== generatedAs;

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start gap-3">
          <Share2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h3 className="text-base font-semibold text-foreground">Export video</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Free. Built from the clips you have already generated, so you can
              export the same cut for as many platforms as you like.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Segmented<ExportFormat>
            label="Frame"
            value={format}
            disabled={disabled || busy}
            onChange={setFormat}
            options={FORMATS.map((option) => ({
              value: option.value,
              label: option.label,
              hint: option.where,
            }))}
          />
          <Segmented<Resolution>
            label="Size"
            value={resolution}
            disabled={disabled || busy}
            onChange={setResolution}
            options={[
              { value: "720p", label: "720p", hint: sizeOf(format, "720p") },
              { value: "1080p", label: "1080p", hint: sizeOf(format, "1080p") },
            ]}
          />
        </div>

        {reframed && (
          <p className="rounded-md border-l-2 border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Your clips were generated at {generatedAs}. Exported at {format} they
            are fitted inside the frame with black bars, not cropped — nothing
            gets cut off, and no face gets squashed.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {missing.length > 0
              ? `Scene ${missing.join(", ")} hasn't been generated yet.`
              : `${ready} of ${total} scenes, at ${sizeOf(format, resolution)}.`}
          </p>
          <Button
            disabled={disabled || busy || missing.length > 0}
            isLoading={busy}
            onClick={() => void handleExport()}
          >
            Export
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

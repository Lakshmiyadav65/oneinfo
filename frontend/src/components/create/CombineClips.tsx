"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getStitchReadiness, startStitch } from "@/lib/api/generation";
import type { GenerationJob } from "@/types/generation";

/**
 * Makes the finished video out of the clips already generated.
 *
 * This closes the most expensive gap in the workflow. Generating scenes one
 * at a time is the cheap, careful way to work — you check a shot before
 * paying for five more — but it left a project full of paid clips and no way
 * to combine them, because the only route to a finished video was a full run
 * that regenerated and re-billed every one of them.
 *
 * Combining calls the video provider zero times, so it is free, and the
 * button says so. That is the whole reason it is worth pressing.
 */
export function CombineClips({
  projectId,
  disabled = false,
  refreshToken = 0,
  onStarted,
}: {
  projectId: string;
  disabled?: boolean;
  /** Bumped when scenes move in or out of the cut, to re-ask readiness. */
  refreshToken?: number;
  /** Handed the started job, so the caller's poller can pick it straight up. */
  onStarted: (job: GenerationJob) => void;
}) {
  const { toast } = useToast();
  const readiness = useAsyncData(
    () => getStitchReadiness(projectId),
    [projectId, refreshToken]
  );
  const [busy, setBusy] = useState(false);

  if (readiness.status !== "success") return null;

  const { scenes_total: total, scenes_ready: ready, missing_scenes: missing } = readiness.data;

  // Nothing generated at all: there is no shortcut to offer, and a card
  // saying so would just be a second empty state under the first.
  if (total === 0 || ready === 0) return null;

  async function handleCombine() {
    setBusy(true);
    try {
      onStarted(await startStitch(projectId));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't combine the clips",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <Layers className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {missing.length === 0
                ? "Combine the clips you already have"
                : `${ready} of ${total} scenes are generated`}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {missing.length === 0 ? (
                <>
                  Every scene has a clip. Stitching them into the finished video costs
                  nothing — no scene is generated again.
                </>
              ) : (
                <>
                  {missing.length === 1
                    ? `Scene ${missing[0]} still needs generating`
                    : `Scenes ${missing.join(", ")} still need generating`}{" "}
                  before the clips can be combined, or the video would have a gap in it.
                </>
              )}
            </p>
          </div>
        </div>

        {missing.length === 0 && (
          <Button
            className="shrink-0"
            disabled={disabled || busy}
            isLoading={busy}
            onClick={() => void handleCombine()}
          >
            Combine into video — free
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

import { AlertTriangle, Check, Circle } from "lucide-react";
import { Progress } from "@/components/ui/Progress";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils/cn";
import type { GenerationJob } from "@/types/generation";

/**
 * The stages of a generation run, and how far through them it is.
 *
 * Replaces a lone spinner captioned with whatever string the worker last
 * wrote. That told you something was happening but never what, how much of
 * it was left, or - once the job finished - what had happened at all: the
 * page went straight from spinner to video with no account of the run.
 */

type PhaseKey = "queued" | "scenes" | "render" | "done";

/**
 * A single-scene preview stops after the scene: there is nothing to stitch
 * and no final video, so listing that step would show a stage that can never
 * run — and, once the job completed, tick it as though it had.
 */
function phasesFor(job: GenerationJob): { key: PhaseKey; label: string }[] {
  // A stitch-only run generates nothing - it gathers clips that already
  // exist. Calling that "Generating scenes" would imply it was spending.
  const scenes = job.stitch_only
    ? "Collecting your clips"
    : job.scene_id
      ? "Generating the scene"
      : "Generating scenes";
  return [
    { key: "queued", label: "Queued" },
    { key: "scenes", label: scenes },
    ...(job.scene_id
      ? []
      : [{ key: "render" as const, label: "Stitching and captioning" }]),
    { key: "done", label: "Finished" },
  ];
}

function phaseOf(job: GenerationJob): PhaseKey {
  if (job.status === "queued") return "queued";
  if (job.status === "completed") return "done";
  // Both the processing and failed cases are placed by the last stage the
  // worker recorded, so a failure is marked against the step it died in
  // rather than against the run as a whole.
  return job.current_stage?.startsWith("Rendering") ? "render" : "scenes";
}

function percentOf(job: GenerationJob, phase: PhaseKey): number {
  if (phase === "done") return 100;
  if (phase === "render") return 95;
  if (phase === "queued") return 0;
  // Scene generation is nearly all of the wall clock — roughly 45s per scene
  // against a few seconds for the stitch — so it owns most of the bar.
  const { scenes_completed: doneCount, scenes_total: total } = job;
  if (!total || doneCount === null) return 4;
  return 4 + (doneCount / total) * 86;
}

function sceneLabel(job: GenerationJob): string | null {
  if (job.scene_id) return "Single scene preview";
  const { scenes_completed: doneCount, scenes_total: total } = job;
  // Null on jobs that ran before the counters existed. Saying nothing beats
  // reporting "0 of 0 scenes" about a run that plainly rendered some.
  if (!total || doneCount === null) return null;
  if (job.stitch_only) return `${doneCount} of ${total} clips collected`;
  return `${doneCount} of ${total} scenes rendered`;
}

export function GenerationProgress({ job }: { job: GenerationJob }) {
  const phases = phasesFor(job);
  const phase = phaseOf(job);
  const activeIndex = phases.findIndex((p) => p.key === phase);
  const failed = job.status === "failed";
  const percent = percentOf(job, phase);
  const scenes = sceneLabel(job);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium text-foreground">
            {failed
              ? job.stitch_only
                ? "Combining stopped"
                : "Generation stopped"
              : job.status === "completed"
                ? "Video ready"
                : (job.current_stage ?? "Working…")}
          </p>
          {scenes && (
            <p className="text-xs tabular-nums text-muted-foreground">{scenes}</p>
          )}
        </div>
        <Progress
          value={percent}
          className={cn(failed && "[&>div]:bg-destructive")}
        />
      </div>

      <ol className="space-y-2">
        {phases.map((p, index) => {
          const isDone = index < activeIndex || job.status === "completed";
          const isCurrent = index === activeIndex && job.status !== "completed";
          const isFailedHere = isCurrent && failed;

          return (
            <li
              key={p.key}
              className={cn(
                "flex items-center gap-2 text-sm",
                isFailedHere
                  ? "text-destructive"
                  : isCurrent
                    ? "font-medium text-foreground"
                    : isDone
                      ? "text-foreground"
                      : "text-muted-foreground"
              )}
            >
              <span
                className="flex size-4 shrink-0 items-center justify-center"
                aria-hidden="true"
              >
                {isFailedHere ? (
                  <AlertTriangle className="size-3.5" />
                ) : isDone ? (
                  <Check className="size-3.5 text-primary" />
                ) : isCurrent ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <Circle className="size-2 fill-muted stroke-muted" />
                )}
              </span>
              {p.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

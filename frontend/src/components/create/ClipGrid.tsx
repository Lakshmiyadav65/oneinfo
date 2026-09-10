"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Film } from "lucide-react";
import { getSceneClip, getSceneTakes, selectSceneTake } from "@/lib/api/generation";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import type { GenerationJob } from "@/types/generation";
import type { StoryboardScene } from "@/types/storyboard";

/**
 * Every clip in the video, as tiles, while the run is happening.
 *
 * A single progress bar answers "how long left" and nothing else. Generation
 * is clip by clip and each finished clip is already paid for, so the useful
 * question during a run is which clip is being made now and whether the ones
 * already done are any good. A creator who can see clip two came out wrong
 * can stop the run instead of paying for four more.
 */

type ClipState = "done" | "running" | "failed" | "waiting";

/**
 * Derived from the job's counters rather than stored per scene. The worker
 * writes scenes_completed as it goes, so the clip at that index is the one
 * currently in flight - and, if the run died, the one it died on.
 */
function stateOf(index: number, job: GenerationJob): ClipState {
  const done = job.scenes_completed ?? 0;
  if (index < done) return "done";
  if (job.status === "failed") return index === done ? "failed" : "waiting";
  if (job.status === "completed") return "done";
  if (job.status === "processing" && index === done) return "running";
  return "waiting";
}

function ClipTile({
  projectId,
  scene,
  index,
  state,
}: {
  projectId: string;
  scene: StoryboardScene;
  index: number;
  state: ClipState;
}) {
  const { toast } = useToast();
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [takeCount, setTakeCount] = useState(0);
  const [take, setTake] = useState(scene.selected_take);
  const objectUrl = useRef<string | null>(null);

  // Fetched once the clip exists, and only then: asking for a scene that has
  // not been generated yet is a guaranteed 404 per tile per poll.
  useEffect(() => {
    if (state !== "done") return;
    let cancelled = false;
    getSceneClip(projectId, scene.id, take)
      .then((blob) => {
        if (cancelled) return;
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = URL.createObjectURL(blob);
        setClipUrl(objectUrl.current);
      })
      // Silent: the tile still says the clip is done, and the finished video
      // below is the thing that actually matters.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectId, scene.id, state, take]);

  // How many takes there are to choose between. Only asked once the scene is
  // done, since before that the answer is always none.
  useEffect(() => {
    if (state !== "done") return;
    let cancelled = false;
    getSceneTakes(projectId, scene.id)
      .then((result) => {
        if (cancelled) return;
        setTakeCount(result.takes);
        setTake(result.selected_take);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectId, scene.id, state]);

  async function chooseTake(next: number) {
    const previous = take;
    // Switched immediately: picking a take is free and reversible, so making
    // the creator wait on a round trip to see the other one is pure friction.
    setTake(next);
    try {
      await selectSceneTake(projectId, scene.id, next);
    } catch (err) {
      setTake(previous);
      toast({
        variant: "destructive",
        title: "Couldn't switch take",
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    []
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3 transition-colors",
        state === "running"
          ? "border-primary bg-primary/5"
          : state === "failed"
            ? "border-destructive/40 bg-destructive/5"
            : "border-border",
        state === "waiting" && "opacity-60"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">Clip {index + 1}</p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {scene.features_creator && <span className="text-foreground">You</span>}
          <span className="tabular-nums">{scene.duration_seconds}s</span>
          {state === "done" && <Check className="size-3.5 text-primary" aria-label="Done" />}
          {state === "running" && <Spinner className="size-3.5" aria-label="Generating" />}
          {state === "failed" && (
            <AlertTriangle className="size-3.5 text-destructive" aria-label="Failed" />
          )}
        </div>
      </div>

      <div className="aspect-video overflow-hidden rounded-md bg-muted">
        {clipUrl ? (
          <video src={clipUrl} controls className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center">
            {state === "running" ? (
              <Spinner />
            ) : (
              <Film className="size-5 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
        )}
      </div>

      {/*
        The spoken line, not the visual prompt. It is what the clip is of,
        it is short enough to read at a glance, and after the prompt change
        it is also the thing most worth checking came out in the right
        language.
      */}
      {/*
        Only shown when there is a choice. One take is not a decision, and a
        row of one button implies there should be more.
      */}
      {takeCount > 1 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Take">
          {Array.from({ length: takeCount }, (_, index) => (
            <button
              key={index}
              type="button"
              aria-pressed={index === take}
              onClick={() => void chooseTake(index)}
              className={cn(
                "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                index === take
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              Take {index + 1}
            </button>
          ))}
        </div>
      )}

      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {scene.voiceover}
      </p>
    </div>
  );
}

export function ClipGrid({
  projectId,
  scenes,
  job,
}: {
  projectId: string;
  scenes: StoryboardScene[];
  job: GenerationJob;
}) {
  // A single-scene preview is one clip, and it is shown on the storyboard
  // step beside the scene it came from. A grid of one, with the rest greyed
  // out, would misdescribe what the run did.
  if (job.scene_id) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {scenes.map((scene, index) => (
        <ClipTile
          key={scene.id}
          projectId={projectId}
          scene={scene}
          index={index}
          state={stateOf(index, job)}
        />
      ))}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Download, Film } from "lucide-react";
import { setSceneInclusion } from "@/lib/api/storyboard";
import { getSceneClip, getSceneTakes, selectSceneTake } from "@/lib/api/generation";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import type { GenerationJob } from "@/types/generation";
import type { StoryboardScene } from "@/types/storyboard";
import type { AspectRatio } from "@/types/output-settings";

/**
 * Every clip in the video, as tiles, while the run is happening.
 *
 * A single progress bar answers "how long left" and nothing else. Generation
 * is clip by clip and each finished clip is already paid for, so the useful
 * question during a run is which clip is being made now and whether the ones
 * already done are any good. A creator who can see clip two came out wrong
 * can stop the run instead of paying for four more.
 */

type ClipState = "done" | "running" | "failed" | "waiting" | "excluded";

/**
 * Derived from the job's counters rather than stored per scene. The worker
 * writes scenes_completed as it goes, so the clip at that position is the
 * one currently in flight - and, if the run died, the one it died on.
 *
 * `position` counts only the scenes actually in the run. The worker skips
 * excluded scenes, so counting them here shifted every tile after the first
 * excluded one: it marked the excluded scene "done" and then fetched a clip
 * that had never been generated for it.
 */
function stateOf(position: number | null, job: GenerationJob): ClipState {
  if (position === null) return "excluded";
  const done = job.scenes_completed ?? 0;
  if (position < done) return "done";
  if (job.status === "failed") return position === done ? "failed" : "waiting";
  if (job.status === "completed") return "done";
  if (job.status === "processing" && position === done) return "running";
  return "waiting";
}

function ClipTile({
  projectId,
  scene,
  index,
  state,
  aspectRatio,
  onInclusionChanged,
}: {
  projectId: string;
  scene: StoryboardScene;
  index: number;
  state: ClipState;
  aspectRatio: AspectRatio;
  onInclusionChanged: () => void;
}) {
  const { toast } = useToast();
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [takeCount, setTakeCount] = useState(0);
  const [take, setTake] = useState(scene.selected_take);
  const objectUrl = useRef<string | null>(null);

  // Fetched once the clip exists, and only then: asking for a scene that has
  // not been generated yet is a guaranteed 404 per tile per poll. An
  // excluded scene is included here on purpose - it may already have a clip
  // from an earlier run, and seeing what is being dropped is the whole basis
  // for deciding whether to put it back.
  const hasClip = state === "done" || state === "excluded";
  useEffect(() => {
    if (!hasClip) return;
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
  }, [projectId, scene.id, hasClip, take]);

  // How many takes there are to choose between. Only asked once the scene is
  // done, since before that the answer is always none.
  useEffect(() => {
    if (!hasClip) return;
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
  }, [projectId, scene.id, hasClip]);

  const [included, setIncluded] = useState(scene.included_in_video);

  async function toggleIncluded() {
    const next = !included;
    // Switched immediately. Leaving a scene out costs nothing and keeps the
    // clip, so waiting on a round trip to see the tile dim is pure friction.
    setIncluded(next);
    try {
      await setSceneInclusion(projectId, scene.id, next);
      onInclusionChanged();
    } catch (err) {
      setIncluded(!next);
      toast({
        variant: "destructive",
        title: "Couldn't change that",
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

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
        state === "excluded" && "border-dashed",
        state === "waiting" && "opacity-60",
        !included && "opacity-50 saturate-0"
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

      {/*
        Shaped like the clip actually is. A vertical video in a 16:9 box sits
        in the middle of two grey bars, which is exactly what the creator is
        trying to avoid producing.
      */}
      <div
        className={cn(
          "overflow-hidden rounded-md bg-black",
          aspectRatio === "9:16" ? "mx-auto aspect-[9/16] max-h-64" : "aspect-video"
        )}
      >
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

      {/*
        The creator's cut. A scene left out keeps its clip and can be put
        straight back, which is why this is a toggle rather than a delete:
        dropping a shot from this video is not the same as deciding it was
        never worth making, and it may well have been paid for.
      */}
      <label className="flex cursor-pointer items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={included}
          onChange={() => void toggleIncluded()}
          className="size-3.5 accent-[var(--primary)]"
        />
        <span className={included ? "text-foreground" : "text-muted-foreground"}>
          {included ? "In the video" : "Left out"}
        </span>
      </label>

      {/*
        Per clip, not only for the finished video. A creator who wants one
        shot for something else should not have to re-cut the whole export.
      */}
      {clipUrl && (
        <a
          href={clipUrl}
          download={`clip-${index + 1}${takeCount > 1 ? `-take-${take + 1}` : ""}.mp4`}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Download
        </a>
      )}
    </div>
  );
}

export function ClipGrid({
  projectId,
  scenes,
  job,
  aspectRatio,
  onInclusionChanged,
}: {
  projectId: string;
  scenes: StoryboardScene[];
  job: GenerationJob;
  aspectRatio: AspectRatio;
  /** A scene moved in or out of the cut, so the combine card must recheck. */
  onInclusionChanged: () => void;
}) {
  // A single-scene preview is one clip, and it is shown on the storyboard
  // step beside the scene it came from. A grid of one, with the rest greyed
  // out, would misdescribe what the run did.
  if (job.scene_id) return null;

  // Position within the run, which is the order the worker actually
  // generates in. Excluded scenes hold no position and are shown as such.
  let position = 0;
  const positions = scenes.map((scene) =>
    scene.included_in_video ? position++ : null
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {scenes.map((scene, index) => (
        <ClipTile
          key={scene.id}
          projectId={projectId}
          scene={scene}
          index={index}
          state={stateOf(positions[index], job)}
          aspectRatio={aspectRatio}
          onInclusionChanged={onInclusionChanged}
        />
      ))}
    </div>
  );
}

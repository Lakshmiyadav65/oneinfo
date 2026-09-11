"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Download, Film } from "lucide-react";
import { setSceneInclusion } from "@/lib/api/storyboard";
import { getSceneClip, getSceneTakes, selectSceneTake } from "@/lib/api/generation";
import type { SceneTake } from "@/lib/api/generation";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import type { GenerationJob } from "@/types/generation";
import type { StoryboardScene } from "@/types/storyboard";
import type { AspectRatio } from "@/types/output-settings";

/**
 * Every clip in the video, as tiles: what exists, what is being made, and
 * which ones go into the finished cut.
 *
 * Whether a clip exists is asked of the server per scene, never inferred
 * from the last job. Inferring it was wrong twice over: the grid hid itself
 * entirely whenever the most recent job happened to be a single-scene
 * preview, and it read "done" off a counter that skips excluded scenes, so
 * one exclusion shifted every tile after it. What clips a project has is a
 * fact about the project, not about whatever was run last.
 *
 * The job is consulted for one thing only: which scene is being generated
 * right now, so that tile can show it.
 */

type LiveState = "running" | "failed" | null;

function liveStateOf(
  scene: StoryboardScene,
  position: number | null,
  job: GenerationJob | null
): LiveState {
  if (!job || job.status === "completed") return null;
  const active = job.status === "processing" || job.status === "queued";

  // A single-scene preview only ever touches the scene it names.
  if (job.scene_id) {
    if (job.scene_id !== scene.id) return null;
    if (active) return "running";
    return job.status === "failed" ? "failed" : null;
  }

  // Excluded scenes are not in the run at all, so nothing is happening to
  // them however far along it is.
  if (position === null) return null;
  const done = job.scenes_completed ?? 0;
  if (position !== done) return null;
  if (active) return "running";
  return job.status === "failed" ? "failed" : null;
}

function ClipTile({
  projectId,
  scene,
  index,
  live,
  aspectRatio,
  onInclusionChanged,
}: {
  projectId: string;
  scene: StoryboardScene;
  index: number;
  /** Whether this scene is the one the current run is working on. */
  live: LiveState;
  aspectRatio: AspectRatio;
  onInclusionChanged: () => void;
}) {
  const { toast } = useToast();
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [takes, setTakes] = useState<SceneTake[]>([]);
  const [take, setTake] = useState(scene.selected_take);
  const objectUrl = useRef<string | null>(null);

  // How many takes this scene has, which is also how we know whether it has
  // been generated at all. Asked of the server rather than worked out from
  // the last job, and re-asked when a run finishes so a freshly generated
  // clip appears without a reload. An excluded scene is asked too: it may
  // have a clip from an earlier run, and seeing what is being dropped is the
  // whole basis for deciding whether to put it back.
  useEffect(() => {
    if (live === "running") return;
    let cancelled = false;
    getSceneTakes(projectId, scene.id)
      .then((result) => {
        if (cancelled) return;
        setTakes(result.takes);
        setTake(result.selected_take);
      })
      // A scene that has never been generated answers 0 takes, or 404s on a
      // storyboard the server no longer knows. Either way there is nothing
      // to show and nothing worth saying.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectId, scene.id, live]);

  const hasClip = takes.length > 0;

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
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectId, scene.id, hasClip, take]);

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
        live === "running"
          ? "border-primary bg-primary/5"
          : live === "failed"
            ? "border-destructive/40 bg-destructive/5"
            : "border-border",
        !hasClip && live === null && "border-dashed opacity-70",
        !included && "opacity-50 saturate-0"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">Clip {index + 1}</p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {scene.features_creator && <span className="text-foreground">You</span>}
          <span className="tabular-nums">{scene.duration_seconds}s</span>
          {live === "running" && <Spinner className="size-3.5" aria-label="Generating" />}
          {live === "failed" && (
            <AlertTriangle className="size-3.5 text-destructive" aria-label="Failed" />
          )}
          {live === null && hasClip && (
            <Check className="size-3.5 text-primary" aria-label="Generated" />
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
          <video src={clipUrl} controls className="size-full object-contain" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1.5">
            {live === "running" ? (
              <Spinner />
            ) : (
              <>
                <Film className="size-5 text-muted-foreground" aria-hidden="true" />
                <span className="text-[11px] text-muted-foreground">
                  Not generated yet
                </span>
              </>
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
      {takes.length > 1 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Take">
          {/*
            Keyed and chosen by the server's index, labelled by position.
            The two differ once a scene has been regenerated: it then holds
            takes 1 and 2, and a button reading "Take 0" names a clip that
            was deleted.
          */}
          {takes.map((clip, position) => (
            <button
              key={clip.take_index}
              type="button"
              aria-pressed={clip.take_index === take}
              onClick={() => void chooseTake(clip.take_index)}
              className={cn(
                "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                clip.take_index === take
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              Take {position + 1}
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
          download={`clip-${index + 1}${
            takes.length > 1
              ? `-take-${takes.findIndex((c) => c.take_index === take) + 1}`
              : ""
          }.mp4`}
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
  /** Null when nothing has ever been generated for this project. */
  job: GenerationJob | null;
  aspectRatio: AspectRatio;
  /** A scene moved in or out of the cut, so the combine card must recheck. */
  onInclusionChanged: () => void;
}) {
  if (scenes.length === 0) return null;

  // Position within the run, which is the order the worker actually
  // generates in. Excluded scenes hold no position, since the run skips
  // them.
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
          live={liveStateOf(scene, positions[index], job)}
          aspectRatio={aspectRatio}
          onInclusionChanged={onInclusionChanged}
        />
      ))}
    </div>
  );
}

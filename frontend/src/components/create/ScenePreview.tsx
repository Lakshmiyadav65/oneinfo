"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Download, Mic } from "lucide-react";
import {
  generateScene,
  getGenerationStatus,
  getSceneClip,
  getSceneTakes,
  selectSceneTake,
  voiceScene,
} from "@/lib/api/generation";
import type { SceneTake, SceneVoice } from "@/lib/api/generation";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { GenerateDialog } from "@/components/create/GenerateDialog";
import { sceneCost } from "@/lib/workflow/scene-cost";
import { cn } from "@/lib/utils/cn";
import type { OutputSettings } from "@/types/output-settings";
import type { Storyboard, StoryboardScene } from "@/types/storyboard";

/**
 * Renders one scene on its own, plays it back, and hands it over.
 *
 * Exists because generating the whole video to check a single shot is an
 * expensive way to find out you don't like it — an on-camera scene alone can
 * cost more than all the b-roll combined. Previewing the one scene you're
 * unsure about turns several paid full runs into one paid scene.
 *
 * The clip is loaded on arrival, not only after generating. It was paid for
 * and it is still on the server; making it disappear on reload implied it
 * had to be generated again, which is the one mistake here that costs money.
 *
 * Regenerating shows the new clip beside the one it replaced. Pressing
 * Regenerate is a question — is this better? — and it used to delete the
 * only thing that could answer it.
 */
export function ScenePreview({
  projectId,
  scene,
  output,
  storyboard,
  onSettingsSaved,
}: {
  projectId: string;
  scene: StoryboardScene;
  output: OutputSettings;
  storyboard: Storyboard;
  /** The dialog saved new settings, so the project needs re-reading. */
  onSettingsSaved: () => void;
}) {
  const sceneId = scene.id;
  const { toast } = useToast();
  // The settings are asked here rather than on arrival: they only matter at
  // the moment of spending, and this button is that moment.
  const [askingSettings, setAskingSettings] = useState(false);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [takes, setTakes] = useState<SceneTake[]>([]);
  const [selected, setSelected] = useState(scene.selected_take);
  const [clips, setClips] = useState<Record<number, string>>({});
  const [voicing, setVoicing] = useState(false);
  const [voice, setVoice] = useState<SceneVoice | null>(null);

  // Held outside state so cleanup can revoke them without depending on the
  // render that created them.
  const objectUrls = useRef(new Map<number, string>());

  const loadTakes = useCallback(async () => {
    // A scene never generated answers with an empty list, or 404s on a
    // storyboard the server no longer knows. Both mean nothing to show.
    try {
      const result = await getSceneTakes(projectId, sceneId);
      setTakes(result.takes);
      setSelected(result.selected_take);
    } catch {
      setTakes([]);
    }
  }, [projectId, sceneId]);

  useEffect(() => {
    // Reads before it writes: loadTakes awaits the server before setting
    // anything, so this is a subscription to an external system rather than
    // the cascading render the rule is written to catch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTakes();
  }, [loadTakes]);

  // One blob per take. Fetched rather than linked because the clip route is
  // auth-gated: a plain <video src> cannot attach the header.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // A take the server no longer lists was dropped along with the run it
      // came from. Its object URL is holding a video nothing can reach.
      const live = new Set(takes.map((take) => take.take_index));
      const stale: number[] = [];
      for (const [index, url] of objectUrls.current) {
        if (live.has(index)) continue;
        URL.revokeObjectURL(url);
        objectUrls.current.delete(index);
        stale.push(index);
      }
      if (stale.length > 0) {
        setClips((current) => {
          const rest = { ...current };
          for (const index of stale) delete rest[index];
          return rest;
        });
      }

      for (const take of takes) {
        if (objectUrls.current.has(take.take_index)) continue;
        try {
          const blob = await getSceneClip(projectId, sceneId, take.take_index);
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          objectUrls.current.set(take.take_index, url);
          setClips((current) => ({ ...current, [take.take_index]: url }));
        } catch {
          // A take whose file has gone. Nothing to show, nothing to say.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, sceneId, takes]);

  useEffect(() => {
    const held = objectUrls.current;
    return () => {
      held.forEach((url) => URL.revokeObjectURL(url));
      held.clear();
    };
  }, []);

  /**
   * The takes grouped into the runs that produced them, newest run first.
   *
   * Grouped on the run rather than laid out flat because the comparison the
   * creator is making is between attempts, not between clips: four takes of
   * one run are one attempt, and the run before them is the thing they are
   * being judged against.
   */
  const runs = useMemo(() => {
    const grouped = new Map<string, SceneTake[]>();
    // Newest first. Take indices count up across runs and never restart, so
    // the highest index belongs to the most recent attempt.
    for (const take of [...takes].sort((a, b) => b.take_index - a.take_index)) {
      // Clips from before runs were recorded share a null id and group
      // together, which is the most that can honestly be said about them.
      const key = take.generation_job_id ?? "before-runs-were-recorded";
      const existing = grouped.get(key);
      if (existing) existing.push(take);
      else grouped.set(key, [take]);
    }
    return [...grouped.values()].map((group) =>
      [...group].sort((a, b) => a.take_index - b.take_index)
    );
  }, [takes]);

  async function addTheRealVoice() {
    setVoicing(true);
    try {
      const result = await voiceScene(projectId, sceneId);
      setVoice(result);

      // The clip route now serves the voiced file for this take, so the one
      // held here is the old audio. Dropped rather than kept: the whole
      // point is to hear the difference straight away.
      const held = objectUrls.current.get(selected);
      if (held) {
        URL.revokeObjectURL(held);
        objectUrls.current.delete(selected);
        setClips((current) => {
          const rest = { ...current };
          delete rest[selected];
          return rest;
        });
      }
      // Re-read under a fresh list identity so the loading effect runs again.
      setTakes((current) => [...current]);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't add the voice",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setVoicing(false);
    }
  }

  async function chooseTake(takeIndex: number) {
    const previous = selected;
    // Switched immediately: picking a take is free and reversible, and the
    // finished video is only rebuilt when the creator asks for it.
    setSelected(takeIndex);
    try {
      await selectSceneTake(projectId, sceneId, takeIndex);
    } catch (err) {
      setSelected(previous);
      toast({
        variant: "destructive",
        title: "Couldn't switch take",
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  async function handleGenerate() {
    setRunning(true);
    setStage("Starting…");
    try {
      await generateScene(projectId, sceneId);

      // The job runs in the background, so poll until it settles. Generation
      // takes ~45s per scene regardless of clip length.
      for (let i = 0; i < 200; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const job = await getGenerationStatus(projectId);
        if (!job) continue;
        setStage(job.current_stage);
        if (job.status === "completed") {
          await loadTakes();
          setStage(null);
          return;
        }
        if (job.status === "failed") {
          throw new Error(job.error_message ?? "Scene generation failed.");
        }
      }
      throw new Error("Timed out waiting for this scene.");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't generate this scene",
        description: err instanceof Error ? err.message : undefined,
      });
      setStage(null);
    } finally {
      setRunning(false);
    }
  }

  const hasClip = takes.length > 0;

  return (
    <div className="space-y-2 pt-1">
      <GenerateDialog
        open={askingSettings}
        onOpenChange={setAskingSettings}
        projectId={projectId}
        output={output}
        storyboard={storyboard}
        scene={scene}
        onConfirmed={async () => {
          onSettingsSaved();
          await handleGenerate();
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={running}
          onClick={() => setAskingSettings(true)}
        >
          {hasClip ? "Regenerate this scene" : "Generate this scene"}
        </Button>
        {/*
          Free, and the button says so. Veo speaks its own lines and speaks
          Telugu badly; this replaces that reading with a real one and never
          touches the video provider, so trying it costs nothing.
        */}
        {hasClip && (
          <Button
            variant="secondary"
            size="sm"
            disabled={running || voicing}
            isLoading={voicing}
            onClick={() => void addTheRealVoice()}
          >
            <Mic className="size-3.5" aria-hidden="true" />
            {voice ? "Redo the voice" : "Add the real voice"}
          </Button>
        )}
        {!running && !voicing && (
          <span className="text-xs text-muted-foreground">
            Just this scene —{" "}
            {sceneCost(scene.duration_seconds, scene.features_creator, output)}
            {runs.length > 1 && " — keeps the one you have"}
          </span>
        )}
      </div>

      {/*
        Said plainly, because no amount of speeding up fixes it. Veo makes
        clips of 4, 6 or 8 seconds and nothing else, so a line written longer
        than its scene has to be shortened.
      */}
      {voice?.overruns && (
        <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <p className="text-xs text-foreground">
            This line takes {voice.spoken_seconds.toFixed(1)}s to say and the scene
            is {voice.clip_seconds.toFixed(0)}s, so the last{" "}
            {voice.overrun_seconds.toFixed(1)}s is cut off. Shorten the dialogue,
            or give the scene a longer clip.
          </p>
        </div>
      )}

      {/*
        A named stage against a spinner, not a disabled button. Generation
        runs for the better part of a minute, and a button that has simply
        gone quiet reads as a page that has broken.
      */}
      {running && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
          <Spinner className="size-4" />
          <p className="text-xs text-foreground">
            {stage ?? "Working…"}
            <span className="text-muted-foreground"> — this takes about a minute.</span>
          </p>
        </div>
      )}

      {/*
        Side by side, newest on the left. Two columns rather than a switcher:
        the question is which of these is better, and a control that shows
        one at a time makes the creator answer it from memory.
      */}
      {hasClip && (
        <div className="grid gap-3 sm:grid-cols-2">
          {runs.flatMap((run, runIndex) =>
            run.map((take, position) => {
              const url = clips[take.take_index];
              const isSelected = take.take_index === selected;
              const label =
                runs.length === 1
                  ? run.length > 1
                    ? `Take ${position + 1}`
                    : null
                  : runIndex === 0
                    ? run.length > 1
                      ? `New · take ${position + 1}`
                      : "New"
                    : run.length > 1
                      ? `Previous · take ${position + 1}`
                      : "Previous";

              return (
                <div
                  key={take.take_index}
                  className={cn(
                    "space-y-2 rounded-lg border p-2 transition-colors",
                    isSelected ? "border-primary bg-primary/5" : "border-border"
                  )}
                >
                  {label && (
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "text-[11px] font-semibold uppercase tracking-wider",
                          runIndex === 0 ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {label}
                      </span>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                          <Check className="size-3" aria-hidden="true" />
                          In the video
                        </span>
                      )}
                    </div>
                  )}

                  {url ? (
                    <video
                      src={url}
                      controls
                      className="max-h-64 w-full rounded-md border border-border bg-black object-contain"
                    />
                  ) : (
                    <div className="flex h-32 items-center justify-center rounded-md border border-border bg-muted/40">
                      <Spinner className="size-4" />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {/*
                      Only where there is a choice. One clip is not a
                      decision, and a button saying so implies there is.
                    */}
                    {takes.length > 1 && !isSelected && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void chooseTake(take.take_index)}
                      >
                        Use this one
                      </Button>
                    )}
                    {url && (
                      <a
                        href={url}
                        download={`scene-${scene.order}${
                          takes.length > 1 ? `-take-${take.take_index + 1}` : ""
                        }.mp4`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Download className="size-3.5" aria-hidden="true" />
                        Download
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

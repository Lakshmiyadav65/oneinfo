"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { generateScene, getGenerationStatus, getSceneClip } from "@/lib/api/generation";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { GenerateDialog } from "@/components/create/GenerateDialog";
import { sceneCost } from "@/lib/workflow/scene-cost";
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
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const objectUrl = useRef<string | null>(null);

  const showClip = useCallback(async () => {
    const blob = await getSceneClip(projectId, sceneId);
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(blob);
    setClipUrl(objectUrl.current);
  }, [projectId, sceneId]);

  // Whatever was generated before. A 404 means this scene has never been
  // generated, which is the ordinary case and not worth a message.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const blob = await getSceneClip(projectId, sceneId);
        if (cancelled) return;
        objectUrl.current = URL.createObjectURL(blob);
        setClipUrl(objectUrl.current);
      } catch {
        // Never generated. Nothing to show, nothing to say.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, sceneId]);

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    []
  );

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
          await showClip();
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
          {clipUrl ? "Regenerate this scene" : "Generate this scene"}
        </Button>
        {!running && (
          <span className="text-xs text-muted-foreground">
            Just this scene —{" "}
            {sceneCost(scene.duration_seconds, scene.features_creator, output)}
          </span>
        )}
      </div>

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

      {clipUrl && (
        <div className="space-y-2">
          <video
            src={clipUrl}
            controls
            className="w-full max-w-sm rounded-md border border-border"
          />
          <Button variant="ghost" size="sm" asChild>
            <a href={clipUrl} download={`scene-${scene.order}.mp4`}>
              <Download className="size-4" />
              Download this clip
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}

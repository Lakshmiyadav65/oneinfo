"use client";

import { useEffect, useRef, useState } from "react";
import { generateScene, getGenerationStatus, getSceneClip } from "@/lib/api/generation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/**
 * Renders one scene on its own and plays it back.
 *
 * Exists because generating the whole video to check a single shot is an
 * expensive way to find out you don't like it — an on-camera scene alone can
 * cost more than all the b-roll combined. Previewing the one scene you're
 * unsure about turns several paid full runs into one paid scene.
 */
export function ScenePreview({
  projectId,
  sceneId,
  cost,
}: {
  projectId: string;
  sceneId: string;
  cost: string;
}) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    []
  );

  async function showClip() {
    const blob = await getSceneClip(projectId, sceneId);
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(blob);
    setClipUrl(objectUrl.current);
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
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          isLoading={running}
          disabled={running}
          onClick={() => void handleGenerate()}
        >
          {clipUrl ? "Regenerate this scene" : "Generate this scene"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {running ? (stage ?? "Working…") : `Just this scene — ${cost}`}
        </span>
      </div>

      {clipUrl && (
        <video
          src={clipUrl}
          controls
          className="w-full max-w-sm rounded-md border border-border"
        />
      )}
    </div>
  );
}

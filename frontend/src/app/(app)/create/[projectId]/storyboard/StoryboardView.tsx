"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getProject } from "@/lib/api/projects";
import {
  getStoryboard,
  generateStoryboard,
  setSceneOnCamera,
} from "@/lib/api/storyboard";
import { getFaceSetup } from "@/lib/api/creator-face";
import { CreatorFacePrompt } from "@/components/create/CreatorFacePrompt";
import { ScenePreview } from "@/components/create/ScenePreview";
import type { Storyboard } from "@/types/storyboard";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";

// Veo bills per second, and an on-camera scene runs on a pricier model
// than b-roll. Surfaced per scene because the toggle below is the main
// thing driving what a video costs, and that shouldn't be invisible.
const B_ROLL_RUPEES_PER_SECOND = 4.78;
const ON_CAMERA_RUPEES_PER_SECOND = 14.33;

function sceneCost(durationSeconds: number, onCamera: boolean): string {
  const rate = onCamera ? ON_CAMERA_RUPEES_PER_SECOND : B_ROLL_RUPEES_PER_SECOND;
  return `₹${Math.round(durationSeconds * rate)}`;
}

// Veo only renders 8-second clips when the creator is in frame, so turning a
// scene on-camera also stretches it to 8s. The surcharge has to price that,
// not just the rate difference on the current length.
const ON_CAMERA_SECONDS = 8;

function onCameraSurcharge(durationSeconds: number): string {
  const extra =
    ON_CAMERA_SECONDS * ON_CAMERA_RUPEES_PER_SECOND -
    durationSeconds * B_ROLL_RUPEES_PER_SECOND;
  return `₹${Math.round(extra)}`;
}

function storyboardCost(storyboard: Storyboard): string {
  const total = storyboard.scenes.reduce(
    (sum, scene) =>
      sum +
      scene.duration_seconds *
        (scene.features_creator ? ON_CAMERA_RUPEES_PER_SECOND : B_ROLL_RUPEES_PER_SECOND),
    0
  );
  return `₹${Math.round(total)}`;
}

function errorDescription(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined;
}

export function StoryboardView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const project = useAsyncData(() => getProject(projectId), [projectId]);
  const storyboardQuery = useAsyncData(() => getStoryboard(projectId), [projectId]);
  const faceQuery = useAsyncData(() => getFaceSetup(), []);
  const [isGenerating, setIsGenerating] = useState(false);
  const [override, setOverride] = useState<Storyboard | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [autoFailed, setAutoFailed] = useState<string | null>(null);
  // Same guard as the script step: set synchronously so a re-render cannot
  // schedule a second call, and surviving StrictMode's double effect.
  const startedFor = useRef<string | null>(null);

  const storyboard =
    override ?? (storyboardQuery.status === "success" ? storyboardQuery.data : null);
  const face = faceQuery.status === "success" ? faceQuery.data : null;
  // Until a photo and consent both exist, generation refuses an on-camera
  // scene -- so the toggle is disabled rather than left to fail on click.
  const canGoOnCamera = face?.ready_for_generation ?? false;

  useEffect(() => {
    if (storyboard && !storyboard.qa_passed) {
      toast({
        title: "QA issues found",
        description: "Review the flagged scenes below before continuing.",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyboard?.id]);

  // Approving the script is the creator saying "build this", so the
  // storyboard writes itself on arrival rather than offering a button that
  // asks the same question again. Only when none exists: coming back to this
  // step must never quietly replace a storyboard already worked on, since
  // the on-camera toggles live on those scenes.
  const needsStoryboard = storyboardQuery.status === "success" && !storyboard;

  useEffect(() => {
    if (!needsStoryboard || startedFor.current === projectId) return;
    startedFor.current = projectId;
    setAutoFailed(null);
    setIsGenerating(true);
    generateStoryboard(projectId)
      .then(() => storyboardQuery.retry())
      .catch((err: unknown) => {
        // Not retried on its own: every attempt is a paid model call.
        setAutoFailed(errorDescription(err) ?? "The storyboard couldn't be built.");
      })
      .finally(() => setIsGenerating(false));
    // storyboardQuery.retry is a new function each render and would re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsStoryboard, projectId]);

  function retryGeneration() {
    startedFor.current = null;
    setAutoFailed(null);
    storyboardQuery.retry();
  }

  if (project.status === "loading") {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (project.status === "error") {
    return <ErrorState description={project.message} onRetry={project.retry} />;
  }

  if (!project.data) {
    return (
      <EmptyState title="Project not found" description="This project isn't available." />
    );
  }

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      await generateStoryboard(projectId);
      setOverride(null);
      storyboardQuery.retry();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't generate storyboard",
        description: errorDescription(err),
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleToggleOnCamera(sceneId: string, next: boolean) {
    setTogglingId(sceneId);
    try {
      setOverride(await setSceneOnCamera(projectId, sceneId, next));
    } catch (err) {
      toast({
        variant: "destructive",
        title: next ? "Can't put you on camera" : "Couldn't update the scene",
        description: errorDescription(err),
      });
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <WorkflowHeader project={project.data} activeStep="storyboard" />

      {storyboardQuery.status === "loading" && (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {storyboardQuery.status === "error" && (
        <ErrorState description={storyboardQuery.message} onRetry={storyboardQuery.retry} />
      )}

      {needsStoryboard && !autoFailed && (
        <Card>
          <CardContent className="flex items-center gap-3 p-6">
            <Spinner />
            <div>
              <p className="text-sm font-medium text-foreground">
                Building your storyboard
              </p>
              <p className="text-sm text-muted-foreground">
                Breaking the approved script into scenes. This takes a few seconds.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {needsStoryboard && autoFailed && (
        <ErrorState
          title="Couldn't build the storyboard"
          description={autoFailed}
          onRetry={retryGeneration}
        />
      )}

      {storyboard && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant={storyboard.qa_passed ? "success" : "destructive"}>
                {storyboard.qa_passed ? "QA Passed" : "QA Issues Found"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Estimated {storyboardCost(storyboard)} to generate
              </span>
            </div>
            <Button variant="secondary" size="sm" onClick={handleGenerate} isLoading={isGenerating}>
              Regenerate Storyboard
            </Button>
          </div>

          {!storyboard.qa_passed && storyboard.qa_issues.length > 0 && (
            <Card className="border-destructive/20 bg-destructive/5">
              <CardContent className="p-4">
                <ul className="list-inside list-disc space-y-1 text-sm text-destructive">
                  {storyboard.qa_issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <CreatorFacePrompt onChange={() => faceQuery.retry()} />

          <div className="space-y-2">
            {storyboard.scenes.map((scene) => (
              <Card key={scene.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        Scene {scene.order}
                      </p>
                      {scene.features_creator && <Badge variant="info">You</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {scene.duration_seconds}s &middot;{" "}
                      {sceneCost(scene.duration_seconds, scene.features_creator)}
                    </p>
                  </div>
                  <p className="text-sm text-foreground">{scene.voiceover}</p>
                  <p className="text-xs text-muted-foreground">
                    Visual: {scene.visual_prompt}
                  </p>
                  <p className="text-xs text-muted-foreground">Caption: {scene.caption}</p>
                  <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={scene.features_creator}
                      disabled={togglingId === scene.id || !canGoOnCamera}
                      onChange={(event) =>
                        void handleToggleOnCamera(scene.id, event.target.checked)
                      }
                    />
                    {canGoOnCamera
                      ? `Put me on camera in this scene${scene.features_creator ? "" : " (becomes 8s)"}`
                      : "Put me on camera (add a photo in Settings first)"}
                    {!scene.features_creator && (
                      <span className="text-muted-foreground/70">
                        (+{onCameraSurcharge(scene.duration_seconds)})
                      </span>
                    )}
                  </label>
                  <ScenePreview
                    projectId={projectId}
                    sceneId={scene.id}
                    cost={sceneCost(scene.duration_seconds, scene.features_creator)}
                  />
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex justify-end">
            <Button onClick={() => router.push(`/create/${projectId}/generate`)}>
              Continue to Generate
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

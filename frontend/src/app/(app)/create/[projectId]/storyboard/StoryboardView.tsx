"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getProject } from "@/lib/api/projects";
import { getStoryboard, generateStoryboard } from "@/lib/api/storyboard";
import { setProjectEnvironment } from "@/lib/api/projects";
import { getFaceSetup } from "@/lib/api/creator-face";
import { voiceProject } from "@/lib/api/generation";
import { CreatorFacePrompt } from "@/components/create/CreatorFacePrompt";
import { VideoLengthControl } from "@/components/create/VideoLengthControl";
import { EnvironmentSetup } from "@/components/create/EnvironmentSetup";
import { SceneCard } from "@/components/create/SceneCard";
import { storyboardCost } from "@/lib/workflow/scene-cost";
import type { EnvironmentPreset, SceneEnvironment } from "@/types/environment";
import type { Storyboard } from "@/types/storyboard";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";

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
  const [isVoicing, setIsVoicing] = useState(false);
  const [override, setOverride] = useState<Storyboard | null>(null);
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

  // The project's default setup, and what to do about scenes that already
  // exist. Held pending until the creator answers, because applying to all
  // is the one action here that can reach across a whole storyboard.
  const [pendingDefault, setPendingDefault] = useState<{
    environment: SceneEnvironment;
    resetToPreset: boolean;
  } | null>(null);
  const [savingDefault, setSavingDefault] = useState(false);

  async function saveDefault(
    environment: SceneEnvironment,
    resetToPreset: boolean,
    applyToAll: boolean
  ) {
    setSavingDefault(true);
    try {
      await setProjectEnvironment(projectId, environment, { applyToAll, resetToPreset });
      project.retry();
      if (applyToAll) {
        setOverride(null);
        storyboardQuery.retry();
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't save the default setup",
        description: errorDescription(err),
      });
    } finally {
      setSavingDefault(false);
      setPendingDefault(null);
    }
  }

  function requestDefault(environment: SceneEnvironment, resetToPreset: boolean) {
    // With no scenes yet there is nothing to overwrite, so no question to ask.
    if (!storyboard || storyboard.scenes.length === 0) {
      void saveDefault(environment, resetToPreset, false);
      return;
    }
    setPendingDefault({ environment, resetToPreset });
  }

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

  async function voiceEveryScene() {
    setIsVoicing(true);
    try {
      const done = await voiceProject(projectId);
      if (done.voiced.length === 0) {
        toast({
          title: "Nothing to voice yet",
          description:
            "No scene has a clip to speak over. Generate a scene first, then come back.",
        });
        return;
      }
      // The overrunning scenes are the only part a creator has to act on:
      // a line longer than its clip cannot be made to fit by speaking
      // faster, and which words go is their decision.
      const tail = [
        done.skipped.length > 0
          ? `${done.skipped.length} not generated yet.`
          : null,
        done.overrunning.length > 0
          ? `Scene ${done.overrunning.join(", ")} runs longer than its clip, so the end is cut off. Shorten the line.`
          : null,
      ]
        .filter(Boolean)
        .join(" ");
      toast({
        title: `${done.voiced.length} ${done.voiced.length === 1 ? "scene" : "scenes"} now in your voice`,
        description: tail || "Every generated scene sounds like the same person.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't set one voice",
        description: errorDescription(err),
      });
    } finally {
      setIsVoicing(false);
    }
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

  // Captured once: inside the callbacks below, TypeScript can no longer see
  // the null check above.
  const projectData = project.data;

  return (
    <div className="space-y-6">
      <WorkflowHeader
        project={projectData}
        activeStep="storyboard"
        onLanguageChanged={() => {
          // The override holds the storyboard this page last edited. It is
          // now behind the server's, so it has to go before the refetch.
          setOverride(null);
          project.retry();
          storyboardQuery.retry();
        }}
      />

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
          {/*
            The shape of the whole video in one line, before the scenes. A
            creator arriving here wants to know how long it runs and what it
            will cost before reading six cards to work it out.

            No "QA Passed" badge. A green tick on every healthy storyboard is
            noise on the pass, which is nearly always; the issues panel below
            still speaks up on the rare fail.
          */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-sm font-semibold text-foreground">
                {storyboard.scenes.length} scenes
              </span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {storyboard.scenes.reduce((sum, s) => sum + s.duration_seconds, 0)}s
              </span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {storyboardCost(storyboard, projectData.output_settings)} to generate
              </span>
              {storyboard.scenes.some((s) => s.features_creator) && (
                <span className="text-xs text-muted-foreground">
                  {storyboard.scenes.filter((s) => s.features_creator).length} with you
                  on camera
                </span>
              )}
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="ml-auto"
              onClick={handleGenerate}
              isLoading={isGenerating}
            >
              Regenerate Storyboard
            </Button>
          </div>

          {/*
            Beside Regenerate, because that is the button that spends it.
            Video is billed by the second, so this is the setting with the
            largest effect on the bill - and the only one that cannot be
            changed once the scenes exist.
          */}
          <VideoLengthControl
            projectId={projectId}
            output={projectData.output_settings}
            actualSeconds={storyboard.scenes.reduce(
              (sum, s) => sum + s.duration_seconds,
              0
            )}
            disabled={isGenerating}
            onSaved={() => void project.refresh()}
          />

          {/*
            One voice across the whole video, which the prompt can ask for
            but cannot guarantee: Veo generates every clip with no memory of
            the last, so it casts a narrator per clip and a video comes back
            with a woman reading one scene and a man the next. Speech here
            comes from one configured speaker, so it matches by construction.

            Free, and offered beside the scenes rather than inside one,
            because doing it scene by scene is how the voices drifted apart
            in the first place.
          */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card p-3">
            <Button
              variant="secondary"
              size="sm"
              isLoading={isVoicing}
              disabled={isGenerating}
              onClick={() => void voiceEveryScene()}
            >
              Use one voice for every scene
            </Button>
            <span className="text-xs text-muted-foreground">
              Free. Replaces the voice on the clips you have already generated
              with your own, so the whole video sounds like one person.
            </span>
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

          {/*
            The project default, so a creator picks a look once rather than
            once per scene. New scenes inherit it; any scene can still
            override it below.
          */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <EnvironmentSetup
                idPrefix="project-default"
                environment={projectData.default_environment}
                disabled={savingDefault}
                showSaved
                onPresetChange={(preset: EnvironmentPreset) =>
                  requestDefault(
                    { ...projectData.default_environment, preset },
                    true
                  )
                }
                onChange={(environment) => requestDefault(environment, false)}
              />
              <p className="text-xs text-muted-foreground">
                Default for new scenes. Each scene can override it.
              </p>

              {pendingDefault && (
                <div
                  role="alert"
                  className="space-y-2 rounded-md border border-border bg-muted/40 p-3"
                >
                  <p className="text-sm text-foreground">
                    Apply this setup to all {storyboard.scenes.length} existing
                    scenes? Scenes whose visual description you edited keep
                    their wording either way.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      isLoading={savingDefault}
                      onClick={() =>
                        void saveDefault(
                          pendingDefault.environment,
                          pendingDefault.resetToPreset,
                          true
                        )
                      }
                    >
                      Apply to all
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={savingDefault}
                      onClick={() =>
                        void saveDefault(
                          pendingDefault.environment,
                          pendingDefault.resetToPreset,
                          false
                        )
                      }
                    >
                      Only new scenes
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-3">
            {storyboard.scenes.map((scene) => (
              <SceneCard
                key={scene.id}
                projectId={projectId}
                scene={scene}
                canGoOnCamera={canGoOnCamera}
                output={projectData.output_settings}
                storyboard={storyboard}
                onRegenerated={() => void project.refresh()}
                onUpdated={setOverride}
              />
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

"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import Link from "next/link";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getProject } from "@/lib/api/projects";
import { getStoryboard } from "@/lib/api/storyboard";
import {
  startGeneration,
  getGenerationStatus,
  getOutput,
  getPlayableOutputUrl,
} from "@/lib/api/generation";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { GenerationProgress } from "@/components/create/GenerationProgress";
import { ClipGrid } from "@/components/create/ClipGrid";
import { GenerateDialog } from "@/components/create/GenerateDialog";
import { CombineClips } from "@/components/create/CombineClips";
import { ExportVideo } from "@/components/create/ExportVideo";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import type { GenerationJob, VideoOutput } from "@/types/generation";

function errorDescription(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined;
}

const TERMINAL_STATUSES = new Set(["completed", "failed"]);

/**
 * A failed job must never put an empty box on the screen, which is what
 * `error_message ?? fallback` did whenever the worker had stored an empty
 * string: nullish coalescing lets "" through, so the creator got an error
 * with no words in it and nothing to act on.
 */
function failureMessage(job: GenerationJob): string {
  return (
    job.error_message?.trim() ||
    "Generation stopped, but no reason was recorded. Starting it again is the " +
      "quickest way to find out whether it repeats."
  );
}

function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function formatSize(bytes: number | null): string | null {
  if (bytes === null) return null;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function GenerateView({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const project = useAsyncData(() => getProject(projectId), [projectId]);
  // The clips being generated. Fetched once: the storyboard is fixed for the
  // duration of a run, so re-reading it on every poll would be pure traffic.
  const storyboard = useAsyncData(() => getStoryboard(projectId), [projectId]);
  const [job, setJob] = useState<GenerationJob | null | undefined>(undefined);
  const [isStarting, setIsStarting] = useState(false);
  // Asked at the point of spending rather than on arrival. Every button that
  // starts a paid run opens this first.
  const [askingSettings, setAskingSettings] = useState(false);
  // Bumped when a scene moves in or out of the cut, so the combine card
  // re-asks whether the video can be built from what is on hand.
  const [cutVersion, setCutVersion] = useState(0);
  const [output, setOutput] = useState<VideoOutput | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGenerationStatus(projectId).then((result) => {
      if (!cancelled) setJob(result);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!job || TERMINAL_STATUSES.has(job.status)) return;
    const timer = setInterval(async () => {
      const updated = await getGenerationStatus(projectId);
      setJob(updated);
    }, 2000);
    return () => clearInterval(timer);
    // Also keyed on the scene counter, so the interval is re-established as
    // progress moves and the bar keeps up with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, job?.scenes_completed, job?.id, projectId]);

  // A single-scene preview is also the project's latest job, but it produces
  // no finished video. Loading the project output on the strength of it would
  // show whichever full render happened to precede it as this run's result.
  const hasFinishedVideo = job?.status === "completed" && !job.scene_id;

  useEffect(() => {
    if (!hasFinishedVideo) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const result = await getOutput(projectId);
        if (!result || cancelled) return;
        const url = await getPlayableOutputUrl(result);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setOutput(result);
        setVideoUrl(url);
      } catch (err) {
        setVideoError(errorDescription(err) ?? "Couldn't load the finished video.");
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [hasFinishedVideo, projectId]);

  const handleStart = useCallback(async () => {
    setIsStarting(true);
    setVideoError(null);
    setVideoUrl(null);
    setOutput(null);
    // The previous run is over. Leaving its outcome up while a new one is
    // starting reports the old failure - or the old success - as though it
    // were this run's, which is the one thing the bar is there to say.
    setJob(null);
    try {
      setJob(await startGeneration(projectId));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't start generation",
        description: errorDescription(err),
      });
    } finally {
      setIsStarting(false);
    }
  }, [projectId, toast]);

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

  // Named after the project so a folder of downloads is still legible a
  // week later. Punctuation out, because it lands in a filename.
  //
  // Marks are kept alongside letters and digits: Telugu vowel signs are
  // marks, not letters, and dropping them turned "తెలుగు" into "త-ల-గ".
  const downloadName =
    project.data.title
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "video";
  const duration = formatDuration(output?.duration_seconds ?? null);
  const size = formatSize(output?.file_size_bytes ?? null);
  const summary = [
    job?.scenes_total ? `${job.scenes_total} scenes` : null,
    duration,
    size,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <WorkflowHeader project={project.data} activeStep="generate" />

      <GenerateDialog
        open={askingSettings}
        onOpenChange={setAskingSettings}
        projectId={projectId}
        output={project.data.output_settings}
        storyboard={storyboard.status === "success" ? storyboard.data : null}
        onConfirmed={async () => {
          // Refreshed rather than retried: this view is gated on `project`,
          // and dropping it back to loading takes the whole page - progress
          // bar included - off the screen just as the run begins.
          void project.refresh();
          await handleStart();
        }}
      />

      {job === undefined && <Skeleton className="h-24 w-full" />}

      {/*
        Above the paid path on purpose. A creator who has already generated
        every scene one at a time should see the free route to a finished
        video before the button that regenerates and re-bills all of them.
      */}
      {job?.status !== "processing" && job?.status !== "queued" && (
        <CombineClips
          projectId={projectId}
          disabled={isStarting}
          refreshToken={cutVersion}
          onStarted={(started) => {
            // Same reset as starting a paid run: the previous finished
            // video is about to be replaced, so it must stop being shown
            // as though it were this run's result.
            setVideoError(null);
            setVideoUrl(null);
            setOutput(null);
            setJob(started);
          }}
        />
      )}

      {/*
        Under combining, and for the same reason it is free: both build the
        finished video out of clips already paid for. Combining makes it at
        the shape the project generates in; exporting says where the file is
        going and frames it for that.
      */}
      {job?.status !== "processing" && job?.status !== "queued" && (
        <ExportVideo
          projectId={projectId}
          generatedAs={project.data.output_settings.aspect_ratio}
          disabled={isStarting}
          refreshToken={cutVersion}
          onStarted={(started) => {
            setVideoError(null);
            setVideoUrl(null);
            setOutput(null);
            setJob(started);
          }}
        />
      )}

      {/*
        Always shown once there is a storyboard, whatever the last job was.
        Which clips a project has is a fact about the project - hiding the
        grid because the most recent run happened to be a single-scene
        preview left the creator with no way to see or choose anything.
      */}
      {storyboard.status === "success" && storyboard.data && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your clips
          </p>
          <ClipGrid
            projectId={projectId}
            scenes={storyboard.data.scenes}
            job={job ?? null}
            aspectRatio={project.data.output_settings.aspect_ratio}
            onInclusionChanged={() => {
              setCutVersion((n) => n + 1);
              void storyboard.refresh();
            }}
          />
        </div>
      )}

      {job === null && !isStarting && (
        <Card>
          <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">Generate Video</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Render every scene in the storyboard, then stitch them into one
                video. Nothing has been generated for this project yet.
              </p>
            </div>
            <Button onClick={() => setAskingSettings(true)} isLoading={isStarting}>
              Generate Video
            </Button>
          </CardContent>
        </Card>
      )}

      {/*
        Shown from the click, not from the reply to it. Starting a run is a
        round trip, and until it came back this card did not exist - so the
        one moment the creator most needs telling that their money is being
        spent was the one moment nothing on the page said so.
      */}
      {(job || isStarting) && (
        <Card>
          <CardContent className="space-y-5 p-6">
            <GenerationProgress job={job ?? null} />


            {job?.status === "failed" && (
              <div className="space-y-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                <p className="text-sm text-foreground">{failureMessage(job)}</p>
                {job.error_detail && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer select-none hover:text-foreground">
                      Technical details
                    </summary>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 font-mono text-[11px] leading-relaxed">
                      {job.error_detail}
                    </pre>
                  </details>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setAskingSettings(true)}
                  isLoading={isStarting}
                >
                  Try again
                </Button>
              </div>
            )}

            {/*
              A finished one-scene preview is a real, successful job, but its
              deliverable lives on the storyboard step beside the scene it came
              from. Saying so beats showing the previous full render here and
              letting it pass for what this run produced.
            */}
            {job?.status === "completed" && job.scene_id && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-sm text-foreground">
                  The last run rendered a single scene as a preview, not the whole
                  video. It plays on the storyboard step, under the scene you
                  generated.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setAskingSettings(true)} isLoading={isStarting}>
                    Generate the full video
                  </Button>
                  <Button variant="secondary" asChild>
                    <Link href={`/create/${projectId}/storyboard`}>Back to storyboard</Link>
                  </Button>
                </div>
              </div>
            )}

            {hasFinishedVideo && (
              <div className="space-y-3">
                {videoError && <ErrorState description={videoError} />}
                {!videoError && videoUrl && (
                  <>
                    {/* Height-capped and centred: a 9:16 export at full
                        width fills two screens on its own. */}
                    <video
                      controls
                      src={videoUrl}
                      className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg border border-border bg-black"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">{summary}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {/*
                          The point of the whole workflow. It was buried
                          behind the player's own overflow menu, which is
                          browser-dependent and absent on some of them.
                        */}
                        <Button size="sm" asChild>
                          <a href={videoUrl} download={`${downloadName}.mp4`}>
                            <Download className="size-4" />
                            Download video
                          </a>
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setAskingSettings(true)}
                          isLoading={isStarting}
                        >
                          Regenerate
                        </Button>
                      </div>
                    </div>
                  </>
                )}
                {!videoError && !videoUrl && (
                  <div className="flex items-center gap-3">
                    <Spinner />
                    <p className="text-sm text-muted-foreground">Loading video…</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

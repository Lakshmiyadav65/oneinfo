"use client";

import { useEffect, useState } from "react";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getProject } from "@/lib/api/projects";
import {
  startGeneration,
  getGenerationStatus,
  getOutput,
  getPlayableOutputUrl,
} from "@/lib/api/generation";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import type { GenerationJob } from "@/types/generation";

function errorDescription(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined;
}

const TERMINAL_STATUSES = new Set(["completed", "failed"]);

export function GenerateView({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const project = useAsyncData(() => getProject(projectId), [projectId]);
  const [job, setJob] = useState<GenerationJob | null | undefined>(undefined);
  const [isStarting, setIsStarting] = useState(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, job?.id, projectId]);

  useEffect(() => {
    if (job?.status !== "completed") return;
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const output = await getOutput(projectId);
        if (!output) return;
        const url = await getPlayableOutputUrl(output);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setVideoUrl(url);
      } catch (err) {
        setVideoError(errorDescription(err) ?? "Couldn't load video");
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [job?.status, projectId]);

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

  async function handleStart() {
    setIsStarting(true);
    try {
      const started = await startGeneration(projectId);
      setJob(started);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't start generation",
        description: errorDescription(err),
      });
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div className="space-y-6">
      <WorkflowHeader project={project.data} activeStep="generate" />

      {job === undefined && <Skeleton className="h-24 w-full" />}

      {job === null && (
        <Card>
          <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">Generate Video</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Render the storyboard into a finished video.
              </p>
            </div>
            <Button onClick={handleStart} isLoading={isStarting}>
              Generate Video
            </Button>
          </CardContent>
        </Card>
      )}

      {job && (job.status === "queued" || job.status === "processing") && (
        <Card>
          <CardContent className="flex items-center gap-3 p-6">
            <Spinner />
            <div>
              <p className="text-sm font-medium text-foreground">
                {job.status === "queued" ? "Queued" : "Processing"}
              </p>
              {job.current_stage && (
                <p className="text-sm text-muted-foreground">{job.current_stage}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {job?.status === "failed" && (
        <ErrorState
          title="Generation failed"
          description={job.error_message ?? "Something went wrong."}
        />
      )}

      {job?.status === "completed" && (
        <Card>
          <CardContent className="p-6">
            {videoError && <ErrorState description={videoError} />}
            {!videoError && videoUrl && (
              <video controls src={videoUrl} className="w-full rounded-md" />
            )}
            {!videoError && !videoUrl && (
              <div className="flex items-center gap-3">
                <Spinner />
                <p className="text-sm text-muted-foreground">Loading video…</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

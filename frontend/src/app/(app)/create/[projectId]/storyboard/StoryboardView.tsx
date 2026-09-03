"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getProject } from "@/lib/api/projects";
import { getStoryboard, generateStoryboard } from "@/lib/api/storyboard";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
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
  const [isGenerating, setIsGenerating] = useState(false);

  const storyboard = storyboardQuery.status === "success" ? storyboardQuery.data : null;

  useEffect(() => {
    if (storyboard && !storyboard.qa_passed) {
      toast({
        title: "QA issues found",
        description: "Review the flagged scenes below before continuing.",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyboard?.id]);

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

      {storyboardQuery.status === "success" && !storyboard && (
        <Card>
          <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">Storyboard</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Generate a scene-by-scene storyboard from the approved script.
              </p>
            </div>
            <Button onClick={handleGenerate} isLoading={isGenerating}>
              Generate Storyboard
            </Button>
          </CardContent>
        </Card>
      )}

      {storyboard && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Badge variant={storyboard.qa_passed ? "success" : "destructive"}>
              {storyboard.qa_passed ? "QA Passed" : "QA Issues Found"}
            </Badge>
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

          <div className="space-y-2">
            {storyboard.scenes.map((scene) => (
              <Card key={scene.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">
                      Scene {scene.order}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {scene.duration_seconds}s
                    </p>
                  </div>
                  <p className="text-sm text-foreground">{scene.voiceover}</p>
                  <p className="text-xs text-muted-foreground">
                    Visual: {scene.visual_prompt}
                  </p>
                  <p className="text-xs text-muted-foreground">Caption: {scene.caption}</p>
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getProject } from "@/lib/api/projects";
import { getTanglish, generateTanglish, updateTanglish, approveTanglish } from "@/lib/api/tanglish";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Label } from "@/components/ui/Label";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import type { Tanglish } from "@/types/tanglish";

function errorDescription(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined;
}

export function TanglishView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const project = useAsyncData(() => getProject(projectId), [projectId]);
  const tanglishQuery = useAsyncData(() => getTanglish(projectId), [projectId]);

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

  return (
    <div className="space-y-6">
      <WorkflowHeader project={project.data} activeStep="tanglish" />

      {tanglishQuery.status === "loading" && (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {tanglishQuery.status === "error" && (
        <ErrorState description={tanglishQuery.message} onRetry={tanglishQuery.retry} />
      )}

      {tanglishQuery.status === "success" && !tanglishQuery.data && (
        <GenerateTanglishCard projectId={projectId} onGenerated={tanglishQuery.retry} />
      )}

      {tanglishQuery.status === "success" && tanglishQuery.data && (
        <TanglishEditor
          key={tanglishQuery.data.id}
          projectId={projectId}
          tanglish={tanglishQuery.data}
          onChanged={tanglishQuery.retry}
        />
      )}

      <div className="flex justify-end">
        <Button
          variant="secondary"
          onClick={() => router.push(`/create/${projectId}/storyboard`)}
        >
          Skip Tanglish → Storyboard
        </Button>
      </div>
    </div>
  );
}

function GenerateTanglishCard({
  projectId,
  onGenerated,
}: {
  projectId: string;
  onGenerated: () => void;
}) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      await generateTanglish(projectId);
      onGenerated();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't generate Tanglish",
        description: errorDescription(err),
      });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Tanglish (optional)</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate a Tanglish version of the approved script.
          </p>
        </div>
        <Button onClick={handleGenerate} isLoading={isGenerating}>
          Generate Tanglish
        </Button>
      </CardContent>
    </Card>
  );
}

function TanglishEditor({
  projectId,
  tanglish,
  onChanged,
}: {
  projectId: string;
  tanglish: Tanglish;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [content, setContent] = useState(tanglish.content);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const isApproved = tanglish.status === "approved";
  const isDirty = content !== tanglish.content;

  async function handleSave() {
    setIsSaving(true);
    try {
      await updateTanglish(projectId, content);
      onChanged();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't save Tanglish",
        description: errorDescription(err),
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRegenerate() {
    setIsRegenerating(true);
    try {
      await generateTanglish(projectId);
      onChanged();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't regenerate Tanglish",
        description: errorDescription(err),
      });
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handleApprove() {
    setIsApproving(true);
    try {
      await approveTanglish(projectId);
      onChanged();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't approve Tanglish",
        description: errorDescription(err),
      });
    } finally {
      setIsApproving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="tanglish-content">Content (v{tanglish.version})</Label>
            <Textarea
              id="tanglish-content"
              rows={12}
              value={content}
              disabled={isApproved}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={handleRegenerate}
              isLoading={isRegenerating}
              disabled={isApproving || isSaving}
            >
              Regenerate
            </Button>
            {!isApproved && (
              <Button
                variant="secondary"
                onClick={handleSave}
                isLoading={isSaving}
                disabled={!isDirty || isRegenerating || isApproving}
              >
                Save Draft
              </Button>
            )}
            {!isApproved && (
              <Button
                onClick={handleApprove}
                isLoading={isApproving}
                disabled={isDirty || isRegenerating || isSaving}
              >
                Approve
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isApproved && (
        <div className="flex justify-end">
          <Button onClick={() => router.push(`/create/${projectId}/storyboard`)}>
            Continue to Storyboard
          </Button>
        </div>
      )}
    </div>
  );
}

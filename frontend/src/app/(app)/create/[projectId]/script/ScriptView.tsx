"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getProject } from "@/lib/api/projects";
import {
  getScript,
  generateScript,
  regenerateScript,
  updateScript,
  approveScript,
} from "@/lib/api/script";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Label } from "@/components/ui/Label";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import type { Script } from "@/types/script";

function errorDescription(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined;
}

export function ScriptView({ projectId }: { projectId: string }) {
  const project = useAsyncData(() => getProject(projectId), [projectId]);
  const scriptQuery = useAsyncData(() => getScript(projectId), [projectId]);

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
      <WorkflowHeader project={project.data} activeStep="script" />

      {scriptQuery.status === "loading" && (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {scriptQuery.status === "error" && (
        <ErrorState description={scriptQuery.message} onRetry={scriptQuery.retry} />
      )}

      {scriptQuery.status === "success" && !scriptQuery.data && (
        <GenerateScriptCard projectId={projectId} onGenerated={scriptQuery.retry} />
      )}

      {scriptQuery.status === "success" && scriptQuery.data && (
        <ScriptEditor
          key={scriptQuery.data.id}
          projectId={projectId}
          script={scriptQuery.data}
          onChanged={scriptQuery.retry}
        />
      )}
    </div>
  );
}

function GenerateScriptCard({
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
      await generateScript(projectId);
      onGenerated();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't generate script",
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
          <h3 className="text-base font-semibold text-foreground">Script</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate a script from your selected hook.
          </p>
        </div>
        <Button onClick={handleGenerate} isLoading={isGenerating}>
          Generate Script
        </Button>
      </CardContent>
    </Card>
  );
}

function ScriptEditor({
  projectId,
  script,
  onChanged,
}: {
  projectId: string;
  script: Script;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState(script.title);
  const [content, setContent] = useState(script.content);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const isApproved = script.status === "approved";
  const isDirty = title !== script.title || content !== script.content;

  async function handleSave() {
    setIsSaving(true);
    try {
      await updateScript(projectId, content, title);
      onChanged();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't save script",
        description: errorDescription(err),
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRegenerate() {
    setIsRegenerating(true);
    try {
      await regenerateScript(projectId);
      onChanged();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't regenerate script",
        description: errorDescription(err),
      });
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handleApprove() {
    setIsApproving(true);
    try {
      await approveScript(projectId);
      onChanged();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't approve script",
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
            <Label htmlFor="script-title">Title</Label>
            <Input
              id="script-title"
              value={title}
              disabled={isApproved}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="script-content">Content (v{script.version})</Label>
            <Textarea
              id="script-content"
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
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => router.push(`/create/${projectId}/storyboard`)}
          >
            Skip to Storyboard
          </Button>
          <Button onClick={() => router.push(`/create/${projectId}/tanglish`)}>
            Add Tanglish (optional)
          </Button>
        </div>
      )}
    </div>
  );
}

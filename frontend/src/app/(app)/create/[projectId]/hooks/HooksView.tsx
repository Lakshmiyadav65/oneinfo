"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getProject } from "@/lib/api/projects";
import {
  listHooks,
  generateHooks,
  regenerateHooks,
  selectHook,
  addCustomHook,
} from "@/lib/api/hooks";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import type { Hook } from "@/types/hook";

function errorDescription(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined;
}

export function HooksView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const project = useAsyncData(() => getProject(projectId), [projectId]);
  const hooksQuery = useAsyncData(() => listHooks(projectId), [projectId]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [ownHook, setOwnHook] = useState("");
  const [isAddingOwn, setIsAddingOwn] = useState(false);

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

  const hooks = hooksQuery.status === "success" ? hooksQuery.data : [];
  const hasSelection = hooks.some((h) => h.is_selected);

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      await (hooks.length > 0 ? regenerateHooks(projectId) : generateHooks(projectId));
      hooksQuery.retry();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't generate hooks",
        description: errorDescription(err),
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleAddOwn() {
    setIsAddingOwn(true);
    try {
      const hook = await addCustomHook(projectId, ownHook);
      setOwnHook("");
      // Select it immediately: someone who typed out their own hook has
      // already chosen it — making them click it again is a pointless step.
      await selectHook(projectId, hook.id);
      hooksQuery.retry();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't add your hook",
        description: errorDescription(err),
      });
    } finally {
      setIsAddingOwn(false);
    }
  }

  async function handleSelect(hookId: string) {
    setSelectingId(hookId);
    try {
      await selectHook(projectId, hookId);
      hooksQuery.retry();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't select hook",
        description: errorDescription(err),
      });
    } finally {
      setSelectingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <WorkflowHeader project={project.data} activeStep="hooks" />

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">Hooks</h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleGenerate}
              isLoading={isGenerating}
            >
              {hooks.length > 0 ? "Regenerate" : "Generate Hooks"}
            </Button>
          </div>

          {hooksQuery.status === "loading" && (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {hooksQuery.status === "error" && (
            <ErrorState description={hooksQuery.message} onRetry={hooksQuery.retry} />
          )}

          {hooksQuery.status === "success" && hooks.length === 0 && (
            <EmptyState
              title="No hooks yet"
              description="Generate a few hook options to choose from."
            />
          )}

          {hooksQuery.status === "success" && hooks.length > 0 && (
            <div className="space-y-2">
              {hooks.map((hook: Hook) => (
                <button
                  key={hook.id}
                  type="button"
                  onClick={() => handleSelect(hook.id)}
                  disabled={selectingId !== null}
                  className={cn(
                    "w-full rounded-md border px-4 py-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    hook.is_selected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {hook.type}
                    </span>
                    {hook.is_recommended && <Badge variant="success">Recommended</Badge>}
                    {hook.is_custom && <Badge>Yours</Badge>}
                  </div>
                  <p className="font-medium text-foreground">{hook.text}</p>
                  {hook.reason && (
                    <p className="mt-1.5 text-xs text-muted-foreground">{hook.reason}</p>
                  )}
                </button>
              ))}
            </div>
          )}
          {/*
            Creators often arrive with a hook already written — from a
            previous chat, or from knowing their audience better than any
            model does. Without this the only way in was to regenerate until
            something close came up.
          */}
          <div className="space-y-1.5 border-t border-border pt-4">
            <Label htmlFor="own-hook">Or write your own</Label>
            <Textarea
              id="own-hook"
              rows={2}
              placeholder="Paste or type a hook you already have."
              value={ownHook}
              onChange={(e) => setOwnHook(e.target.value)}
            />
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAddOwn}
                isLoading={isAddingOwn}
                disabled={!ownHook.trim()}
              >
                Use this hook
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          disabled={!hasSelection}
          onClick={() => router.push(`/create/${projectId}/script`)}
        >
          Continue to Script
        </Button>
      </div>
    </div>
  );
}

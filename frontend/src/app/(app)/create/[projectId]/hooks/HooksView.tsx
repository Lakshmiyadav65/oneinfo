"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Star } from "lucide-react";
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
            <div className="space-y-3">
              {hooks.map((hook: Hook, index: number) => (
                <button
                  key={hook.id}
                  type="button"
                  onClick={() => handleSelect(hook.id)}
                  disabled={selectingId !== null}
                  aria-pressed={hook.is_selected}
                  className={cn(
                    "group relative flex w-full gap-3 rounded-lg border p-4 text-left transition-all",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    // Three tiers, so the list is not five identical rows:
                    // the chosen one, the one the agent argues for, and the
                    // rest. Hover lifts slightly so the cards read as
                    // clickable rather than as static blocks of text.
                    hook.is_selected
                      ? "border-primary bg-primary/15 ring-2 ring-primary"
                      : hook.is_recommended
                        ? "border-primary/40 bg-primary/5 hover:-translate-y-px hover:border-primary hover:shadow-md"
                        : "border-border hover:-translate-y-px hover:border-ring hover:bg-muted/40 hover:shadow-md"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                      hook.is_selected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary"
                    )}
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {hook.type}
                      </span>
                      {hook.is_recommended && (
                        <Badge variant="success">
                          <Star className="mr-1 size-3 fill-current" aria-hidden="true" />
                          Recommended
                        </Badge>
                      )}
                      {hook.is_custom && <Badge>Yours</Badge>}
                    </span>

                    <span className="block text-[15px] font-medium leading-relaxed text-foreground">
                      {hook.text}
                    </span>

                    {hook.reason && (
                      <span className="mt-2 block border-t border-border/60 pt-2 text-xs italic text-muted-foreground">
                        {hook.reason}
                      </span>
                    )}
                  </span>

                  {/*
                    A radio-style target, empty until chosen. An affordance
                    that is visible before you click is what tells someone
                    these are options rather than a list of results.
                  */}
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      hook.is_selected
                        ? "border-primary bg-primary"
                        : "border-border group-hover:border-primary"
                    )}
                    aria-hidden="true"
                  >
                    {hook.is_selected && (
                      <Check className="size-3 text-primary-foreground" aria-hidden="true" />
                    )}
                  </span>
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

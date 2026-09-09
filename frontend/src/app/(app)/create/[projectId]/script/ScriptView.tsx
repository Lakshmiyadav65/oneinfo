"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getProject } from "@/lib/api/projects";
import {
  getScript,
  generateScript,
  regenerateScript,
  updateScript,
  approveScript,
  reopenScript,
  getScriptVersions,
  restoreScriptVersion,
} from "@/lib/api/script";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Label } from "@/components/ui/Label";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { parseScriptBeats, renderScriptBeats } from "@/lib/workflow/script-beats";
import { cn } from "@/lib/utils/cn";
import type { Script } from "@/types/script";

function errorDescription(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined;
}

export function ScriptView({ projectId }: { projectId: string }) {
  const project = useAsyncData(() => getProject(projectId), [projectId]);
  const scriptQuery = useAsyncData(() => getScript(projectId), [projectId]);
  const [autoFailed, setAutoFailed] = useState<string | null>(null);
  // Guards the one call. Not state: it must be set synchronously, before a
  // re-render can schedule the effect a second time, and it must survive
  // StrictMode running the effect twice on the same mount.
  const startedFor = useRef<string | null>(null);

  // Arriving with a hook chosen and no script yet is unambiguous - the whole
  // reason for being on this page is to get a script - so write it rather
  // than asking for one more click. Only when none exists: coming back to
  // this step later must never quietly rewrite the script already there.
  const needsScript = scriptQuery.status === "success" && !scriptQuery.data;

  useEffect(() => {
    if (!needsScript || startedFor.current === projectId) return;
    startedFor.current = projectId;
    setAutoFailed(null);
    generateScript(projectId)
      .then(() => scriptQuery.retry())
      .catch((err: unknown) => {
        // Deliberately not retried on its own. Every attempt is a paid model
        // call, and a page that quietly loops on failure is how a bad prompt
        // turns into a bill.
        setAutoFailed(errorDescription(err) ?? "The script couldn't be written.");
      });
    // scriptQuery.retry is a new function each render and would re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsScript, projectId]);

  function retryGeneration() {
    startedFor.current = null;
    setAutoFailed(null);
    scriptQuery.retry();
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

      {needsScript && !autoFailed && <WritingScriptCard />}

      {needsScript && autoFailed && (
        <ErrorState
          title="Couldn't write the script"
          description={autoFailed}
          onRetry={retryGeneration}
        />
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

function WritingScriptCard() {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-6">
        <Spinner />
        <div>
          <p className="text-sm font-medium text-foreground">Writing your script</p>
          <p className="text-sm text-muted-foreground">
            From the hook you picked and your knowledge base. This takes a few
            seconds.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * One spoken line, exactly as tall as the words in it.
 *
 * The shared Textarea carries a min-h-24 floor, which is right for a page of
 * prose and far too much for a sentence — four beats of it left the step
 * mostly empty box. This overrides the floor and grows the field to its own
 * content instead, so a one-line beat occupies one line.
 */
function BeatLine({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      // Collapse first: scrollHeight only shrinks once the box is smaller
      // than its content, so without this the field can grow but never
      // shrink back when text is deleted.
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    // A narrower window re-wraps the line, which changes how tall it needs
    // to be.
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [value]);

  return (
    <Textarea
      ref={ref}
      id={id}
      aria-label={label}
      rows={1}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-0 resize-none overflow-hidden"
    />
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
  // Beats when the script is in the agent's format, raw text when it isn't -
  // an older script, or one edited down into prose. Exactly one is live; the
  // other is the fallback the editor renders instead.
  const [beats, setBeats] = useState(() => parseScriptBeats(script.content));
  const [rawContent, setRawContent] = useState(script.content);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  // Which version is on screen. Null means the current one, so a new version
  // arriving does not leave the view pinned to what it replaced.
  const [viewing, setViewing] = useState<number | null>(null);

  // Keyed on script.id so a regenerate pulls the new version into the list.
  const versionsQuery = useAsyncData(
    () => getScriptVersions(projectId),
    [projectId, script.id]
  );
  const allVersions = versionsQuery.status === "success" ? versionsQuery.data : [];
  const older =
    viewing === null ? null : allVersions.find((v) => v.version === viewing) ?? null;

  const isApproved = script.status === "approved";
  // Derived rather than held: beats are what the creator types into, and
  // normalizing them back into state on every keystroke would eat a trailing
  // space as fast as it was typed.
  const content = beats ? renderScriptBeats(beats) : rawContent;
  const isDirty = title !== script.title || content !== script.content;

  function updateBeat(index: number, line: string) {
    setBeats((current) =>
      current
        ? current.map((beat, i) => (i === index ? { ...beat, line } : beat))
        : current
    );
  }

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

  async function handleRestore() {
    if (!older) return;
    setIsRestoring(true);
    try {
      await restoreScriptVersion(projectId, older.version);
      // Back to the current version, which is now a copy of the one restored.
      setViewing(null);
      onChanged();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't restore that version",
        description: errorDescription(err),
      });
    } finally {
      setIsRestoring(false);
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

  async function handleReopen() {
    setIsReopening(true);
    try {
      await reopenScript(projectId);
      onChanged();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't reopen the script",
        description: errorDescription(err),
      });
    } finally {
      setIsReopening(false);
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

  const olderBeats = older ? parseScriptBeats(older.content) : null;

  return (
    <div className="space-y-4">
      {/*
        Only worth showing once there is a choice to make. Regenerating keeps
        the take it replaced, so the version you preferred is still reachable
        instead of being written over.
      */}
      {allVersions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Versions</span>
          {allVersions.map((v) => {
            const isShown = v.version === (older?.version ?? script.version);
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setViewing(v.version === script.version ? null : v.version)}
                aria-pressed={isShown}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  isShown
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:border-ring hover:bg-muted/50"
                )}
              >
                v{v.version}
                {v.version === script.version && " · current"}
              </button>
            );
          })}
        </div>
      )}

      {older && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{older.title}</p>
                <p className="text-xs text-muted-foreground">
                  Version {older.version}, kept for comparison. Read-only — bring
                  it back to edit it.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRestore}
                isLoading={isRestoring}
              >
                Use this version
              </Button>
            </div>
            {olderBeats ? (
              <div className="space-y-3 rounded-md border border-border p-3">
                {olderBeats.map((beat, index) => (
                  <div key={index} className="space-y-1">
                    <span className="inline-flex rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-primary">
                      {beat.label}
                    </span>
                    <p className="rounded-md border border-input bg-card px-3 py-2 text-sm text-muted-foreground">
                      {beat.line}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="whitespace-pre-wrap rounded-md border border-input bg-card px-3 py-2 text-sm text-muted-foreground">
                {older.content}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!older && (
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
            <Label htmlFor={beats ? "script-beat-0" : "script-content"}>
              Content (v{script.version})
            </Label>
            {/*
              One field per beat, with the label set apart from the words.
              As one textarea the whole script read as an undifferentiated
              block of text - the shape was in there, but nothing showed it.
            */}
            {beats ? (
              <div className="space-y-3 rounded-md border border-border p-3">
                {beats.map((beat, index) => (
                  <div key={index} className="space-y-1">
                    <span className="inline-flex rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-primary">
                      {beat.label}
                    </span>
                    <BeatLine
                      id={`script-beat-${index}`}
                      label={beat.label}
                      value={beat.line}
                      disabled={isApproved}
                      onChange={(line) => updateBeat(index, line)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <Textarea
                id="script-content"
                rows={12}
                value={rawContent}
                disabled={isApproved}
                onChange={(e) => setRawContent(e.target.value)}
              />
            )}
          </div>
          {isApproved && (
            <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              Approved, so the fields are locked. <strong className="font-medium text-foreground">Edit as draft</strong>{" "}
              unlocks them without regenerating. Anything already built from
              this version — the storyboard, and a rendered video — is left
              alone and will not pick the change up on its own.
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            {/*
              Offered before Regenerate, and deliberately: approving used to
              be one-way, so coming back to a finished project left the
              editor greyed out with regenerating - which discards the script
              and writes a new one - as the only way to change a word.
            */}
            {isApproved && (
              <Button
                variant="secondary"
                onClick={handleReopen}
                isLoading={isReopening}
                disabled={isRegenerating}
              >
                Edit as draft
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={handleRegenerate}
              isLoading={isRegenerating}
              disabled={isApproving || isSaving || isReopening}
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
      )}

      {isApproved && !older && (
        <div className="flex justify-end gap-2">
          <Button onClick={() => router.push(`/create/${projectId}/storyboard`)}>
            Continue to Storyboard
          </Button>
        </div>
      )}
    </div>
  );
}

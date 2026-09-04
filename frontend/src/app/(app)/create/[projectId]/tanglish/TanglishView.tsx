"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getProject } from "@/lib/api/projects";
import { getTanglish, generateTanglish, updateTanglish, approveTanglish } from "@/lib/api/tanglish";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Textarea";
import { Label } from "@/components/ui/Label";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import {
  LANGUAGE_LABELS,
  LOCALIZED_LANGUAGES,
  type LocalizedLanguage,
  type Tanglish,
} from "@/types/tanglish";

function errorDescription(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined;
}

function languageLabel(language: LocalizedLanguage): string {
  return LANGUAGE_LABELS[language] ?? language;
}

function LanguagePicker({
  selected,
  onSelect,
  disabled,
}: {
  selected: LocalizedLanguage;
  onSelect: (language: LocalizedLanguage) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {LOCALIZED_LANGUAGES.map((language) => (
        <button
          key={language.value}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(language.value)}
          className={cn(
            "rounded-md border px-4 py-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            selected === language.value
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-muted/50"
          )}
        >
          <p className="font-medium text-foreground">{language.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{language.hint}</p>
        </button>
      ))}
    </div>
  );
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
        <GenerateLocalizedCard projectId={projectId} onGenerated={tanglishQuery.retry} />
      )}

      {tanglishQuery.status === "success" && tanglishQuery.data && (
        <LocalizedEditor
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
          Keep English → Storyboard
        </Button>
      </div>
    </div>
  );
}

function GenerateLocalizedCard({
  projectId,
  onGenerated,
}: {
  projectId: string;
  onGenerated: () => void;
}) {
  const { toast } = useToast();
  const [language, setLanguage] = useState<LocalizedLanguage>("tenglish");
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      await generateTanglish(projectId, language);
      onGenerated();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't generate the localized script",
        description: errorDescription(err),
      });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <h3 className="text-base font-semibold text-foreground">Language (optional)</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Adapt the approved English script into another language, or skip this
            step to keep it in English.
          </p>
        </div>
        <LanguagePicker selected={language} onSelect={setLanguage} disabled={isGenerating} />
        <div className="flex justify-end">
          <Button onClick={handleGenerate} isLoading={isGenerating}>
            Generate {languageLabel(language)}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LocalizedEditor({
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
  // A legacy Tanglish script isn't a pickable option any more, so start the
  // picker on a language the creator can actually choose.
  const [language, setLanguage] = useState<LocalizedLanguage>(() =>
    LOCALIZED_LANGUAGES.some((l) => l.value === tanglish.language) ? tanglish.language : "tenglish"
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const isApproved = tanglish.status === "approved";
  const isDirty = content !== tanglish.content;
  const isBusy = isSaving || isRegenerating || isApproving;

  async function handleSave() {
    setIsSaving(true);
    try {
      await updateTanglish(projectId, content);
      onChanged();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't save the script",
        description: errorDescription(err),
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRegenerate() {
    setIsRegenerating(true);
    try {
      await generateTanglish(projectId, language);
      onChanged();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't regenerate the script",
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
        title: "Couldn't approve the script",
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
          <div className="flex items-center justify-between">
            <Label htmlFor="tanglish-content">Content (v{tanglish.version})</Label>
            <Badge>{languageLabel(tanglish.language)}</Badge>
          </div>
          <Textarea
            id="tanglish-content"
            rows={12}
            value={content}
            disabled={isApproved}
            onChange={(e) => setContent(e.target.value)}
          />

          {!isApproved && (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                Regenerate in a different language:
              </p>
              <LanguagePicker selected={language} onSelect={setLanguage} disabled={isBusy} />
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={handleRegenerate}
              isLoading={isRegenerating}
              disabled={isApproving || isSaving}
            >
              {language === tanglish.language
                ? "Regenerate"
                : `Regenerate as ${languageLabel(language)}`}
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

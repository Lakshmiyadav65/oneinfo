"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WorkflowStepper } from "@/components/workflow/WorkflowStepper";
import { Card, CardContent } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { createProject } from "@/lib/api/projects";
import { CreatorFacePrompt } from "@/components/create/CreatorFacePrompt";
import { CREATE_STEPS, stepIndex } from "@/lib/workflow/steps";
import { PROJECT_LANGUAGES, type ProjectLanguage } from "@/types/project";
import { cn } from "@/lib/utils/cn";

export default function CreateVideoPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [language, setLanguage] = useState<ProjectLanguage>("english");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      const project = await createProject(idea, title || undefined, language);
      router.push(`/create/${project.id}/hooks`);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't create project",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Create Video</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Turn an idea into a finished video.
        </p>
      </div>

      <WorkflowStepper steps={CREATE_STEPS} activeIndex={stepIndex("idea")} />

      {/*
        Above the idea form on purpose. The on-camera choice happens three
        steps later in the storyboard, so it needs to register before someone
        has already written their idea and is reaching for the button.
      */}
      <CreatorFacePrompt />

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="project-title">Project title (optional)</Label>
            <Input
              id="project-title"
              placeholder="e.g. Weekend recipe series #1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idea">Idea</Label>
            <Textarea
              id="idea"
              rows={5}
              placeholder="What's the video about? Describe your idea in a few sentences."
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
            />
          </div>
          {/*
            Language is chosen here, not at the later Language step. Hooks
            are the first thing generated, and a creator whose audience is
            Telugu cannot judge an English hook without translating it first
            — so asking after the hooks exist is asking too late.
          */}
          <div className="space-y-1.5">
            <Label>Language</Label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_LANGUAGES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setLanguage(option.value)}
                  aria-pressed={language === option.value}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    language === option.value
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <span className="block font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSubmit}
              isLoading={isSubmitting}
              disabled={idea.trim().length === 0}
            >
              Generate Hooks
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

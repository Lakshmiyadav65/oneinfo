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

export default function CreateVideoPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      const project = await createProject(idea, title || undefined);
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
            Asked here, at the start, because the on-camera choice happens
            three steps later in the storyboard and is easy to miss entirely.
          */}
          <CreatorFacePrompt />
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

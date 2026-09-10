"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { WorkflowStepper } from "@/components/workflow/WorkflowStepper";
import { Card, CardContent } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { createProject, suggestIdeas } from "@/lib/api/projects";
import { CreatorFacePrompt } from "@/components/create/CreatorFacePrompt";
import { LinkReader } from "@/components/create/LinkReader";
import { CREATE_STEPS, stepIndex } from "@/lib/workflow/steps";
import { type IdeaSuggestions } from "@/types/project";

export default function CreateVideoPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState<IdeaSuggestions | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);

  async function handleSuggest() {
    setIsSuggesting(true);
    try {
      setSuggestions(await suggestIdeas());
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't suggest ideas",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setIsSuggesting(false);
    }
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      // No language argument: the project takes the server's, and the
      // creator sets it from the header switcher on any step.
      const project = await createProject(idea, title || undefined);
      // Navigate straight away and let the hooks step generate on arrival.
      // Generating here first would hold this button for ~25s with nothing
      // moving; on the next screen the same wait shows the step advance and
      // skeletons filling in.
      router.push(`/create/${project.id}/hooks`);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't create project",
        description: err instanceof Error ? err.message : undefined,
      });
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

      {/* Nothing is finished yet — the project does not exist until submit. */}
      <WorkflowStepper steps={CREATE_STEPS} activeIndex={stepIndex("idea")} completedCount={0} />

      {/*
        Above the idea form on purpose. The on-camera choice happens three
        steps later in the storyboard, so it needs to register before someone
        has already written their idea and is reaching for the button.
      */}
      <CreatorFacePrompt />

      {/*
        Above the form, and only when there is actually a link to read. The
        creator has to see what the page says before hooks are generated
        from it - afterwards is too late to notice we read the wrong page.
      */}
      <LinkReader idea={idea} />

      <Card>
        <CardContent className="space-y-6 p-6 sm:p-8">
          {/*
            No language picker here. It is chosen from the header instead,
            reachable on every step, so starting a project is one question
            rather than two.
          */}
          <div className="space-y-2">
            <Label htmlFor="project-title">Project title (optional)</Label>
            <Input
              id="project-title"
              placeholder="Leave blank and we’ll name it from your idea"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="idea">Idea</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSuggest}
                isLoading={isSuggesting}
              >
                <Lightbulb className="size-4" />
                {suggestions ? "Suggest again" : "No idea? Suggest some"}
              </Button>
            </div>
            <Textarea
              id="idea"
              rows={5}
              placeholder="What's the video about? Describe your idea in a few sentences."
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
            />

            {suggestions && (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-muted-foreground">
                  {suggestions.grounded_in_knowledge
                    ? "Based on your knowledge and past topics. Click one to use it — you can edit it after."
                    : "Generic starters — add documents in My Knowledge and these will match your niche."}
                </p>
                {suggestions.ideas.map((suggestion, index) => (
                  <button
                    key={index}
                    type="button"
                    // Fills the box rather than submitting: a suggestion is a
                    // starting point the creator is expected to edit, not a
                    // finished idea.
                    onClick={() => setIdea(suggestion.text)}
                    className="w-full rounded-md border border-border px-4 py-3 text-left transition-colors hover:border-ring hover:bg-muted/50"
                  >
                    <span className="block text-xs uppercase tracking-wide text-muted-foreground">
                      {suggestion.angle}
                    </span>
                    <span className="mt-1 block text-sm text-foreground">{suggestion.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
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

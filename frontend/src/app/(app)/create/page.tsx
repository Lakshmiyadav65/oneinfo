"use client";

import { WorkflowStepper } from "@/components/workflow/WorkflowStepper";
import { Card, CardContent } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

const STEPS = [
  { key: "idea", label: "Idea" },
  { key: "hooks", label: "Hooks" },
  { key: "script", label: "Script" },
  { key: "tanglish", label: "Tanglish" },
  { key: "storyboard", label: "Storyboard" },
  { key: "generate", label: "Generate" },
];

export default function CreateVideoPage() {
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Create Video</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Turn an idea into a finished video.
        </p>
      </div>

      <WorkflowStepper steps={STEPS} activeIndex={0} />

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="project-title">Project title (optional)</Label>
            <Input id="project-title" placeholder="e.g. Weekend recipe series #1" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idea">Idea</Label>
            <Textarea
              id="idea"
              rows={5}
              placeholder="What's the video about? Describe your idea in a few sentences."
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() =>
                toast({
                  title: "Not available yet",
                  description: "Hook generation lands in a later build.",
                })
              }
            >
              Generate Hooks
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

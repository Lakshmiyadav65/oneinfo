import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { WorkflowStepper } from "@/components/workflow/WorkflowStepper";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { CREATE_STEPS, stepIndex, type CreateStepKey } from "@/lib/workflow/steps";
import type { Project } from "@/types/project";

const STATUS_VARIANT: Record<Project["status"], NonNullable<BadgeProps["variant"]>> = {
  draft: "default",
  hooks: "default",
  script: "default",
  tanglish: "default",
  storyboard: "default",
  generating: "warning",
  completed: "success",
  failed: "destructive",
};

export function WorkflowHeader({
  project,
  activeStep,
}: {
  project: Project;
  activeStep: CreateStepKey;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link
            href={`/projects/${project.id}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to project
          </Link>
          <h2 className="text-xl font-semibold text-foreground">{project.title}</h2>
        </div>
        <Badge variant={STATUS_VARIANT[project.status]}>{project.status}</Badge>
      </div>
      <WorkflowStepper steps={CREATE_STEPS} activeIndex={stepIndex(activeStep)} />
    </div>
  );
}

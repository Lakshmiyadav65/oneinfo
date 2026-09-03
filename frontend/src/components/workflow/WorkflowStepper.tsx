import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type WorkflowStep = {
  key: string;
  label: string;
};

export function WorkflowStepper({
  steps,
  activeIndex,
}: {
  steps: readonly WorkflowStep[];
  activeIndex: number;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-6 gap-y-3">
      {steps.map((step, index) => {
        const isActive = index === activeIndex;
        const isComplete = index < activeIndex;

        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                isActive && "bg-primary text-primary-foreground",
                isComplete && "bg-success/15 text-success",
                !isActive && !isComplete && "bg-muted text-muted-foreground"
              )}
              aria-hidden="true"
            >
              {isComplete ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                "text-sm",
                isActive ? "font-semibold text-foreground" : "text-muted-foreground"
              )}
              aria-current={isActive ? "step" : undefined}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

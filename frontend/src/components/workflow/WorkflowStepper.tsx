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
  const lastIndex = Math.max(steps.length - 1, 1);
  // The fill stops at the current node rather than running past it — the bar
  // shows how far you have come, not how far the step is from finishing.
  const percentComplete = (Math.min(activeIndex, lastIndex) / lastIndex) * 100;
  const current = steps[activeIndex];

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-foreground">
          {current?.label}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            Step {activeIndex + 1} of {steps.length}
          </span>
        </p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {Math.round(percentComplete)}%
        </p>
      </div>

      <div className="relative">
        {/*
          The track sits behind the nodes and is centred on them: top-3 is
          half of the size-6 node, so the line meets each circle's middle
          rather than floating above or below it.
        */}
        <div
          className="absolute left-0 right-0 top-3 h-1 -translate-y-1/2 rounded-full bg-muted"
          aria-hidden="true"
        />
        <div
          className="absolute left-0 top-3 h-1 -translate-y-1/2 rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${percentComplete}%` }}
          aria-hidden="true"
        />

        <ol className="relative flex items-start justify-between">
          {steps.map((step, index) => {
            const isActive = index === activeIndex;
            const isComplete = index < activeIndex;

            return (
              <li key={step.key} className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                    // A ring in the page background colour punches a gap in
                    // the track behind each node, so the line reads as
                    // connecting the steps rather than running through them.
                    "ring-4 ring-background",
                    isActive && "bg-primary text-primary-foreground",
                    isComplete && "bg-primary/20 text-primary",
                    !isActive && !isComplete && "bg-muted text-muted-foreground"
                  )}
                  aria-hidden="true"
                >
                  {isComplete ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span
                  className={cn(
                    // Labels would collide on a narrow screen, so off the
                    // current step they only appear once there is room.
                    "hidden text-center text-xs sm:block",
                    isActive
                      ? "!block font-semibold text-foreground"
                      : "text-muted-foreground"
                  )}
                  aria-current={isActive ? "step" : undefined}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

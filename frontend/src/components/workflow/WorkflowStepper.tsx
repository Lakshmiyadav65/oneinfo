import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type WorkflowStep = {
  key: string;
  label: string;
};

export function WorkflowStepper({
  steps,
  activeIndex,
  completedCount,
  hrefFor,
}: {
  steps: readonly WorkflowStep[];
  activeIndex: number;
  /**
   * Steps the project has genuinely finished. Kept separate from
   * `activeIndex` because navigating to a step is not the same as clearing
   * it — the bar reports progress, the highlight reports position.
   */
  completedCount: number;
  /**
   * Where a step leads, or null for one that cannot be opened. Steps were
   * previously plain text, so a creator looking at a finished project had no
   * way back to a section from here — clicking a label only selected it.
   */
  hrefFor?: (step: WorkflowStep, index: number) => string | null;
}) {
  const done = Math.min(Math.max(completedCount, 0), steps.length);
  // The nodes sit at even fractions of the track, so the fill has to end on
  // the last finished node rather than at `done / steps.length` — otherwise a
  // fully finished project paints the bar past the final circle.
  const lastIndex = Math.max(steps.length - 1, 1);
  const percentComplete = done === 0 ? 0 : ((done - 1) / lastIndex) * 100;
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
          {done} of {steps.length} done
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
            const isComplete = index < done;
            const href = hrefFor?.(step, index) ?? null;

            const body = (
              <>
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                    // A ring in the page background colour punches a gap in
                    // the track behind each node, so the line reads as
                    // connecting the steps rather than running through them.
                    "ring-4 ring-background",
                    // A step can be both finished and the one you are on
                    // (the generate step of a completed project), so the
                    // active fill wins and the check still shows through.
                    isActive && "bg-primary text-primary-foreground",
                    !isActive && isComplete && "bg-primary/20 text-primary",
                    !isActive && !isComplete && "bg-muted text-muted-foreground",
                    href && !isActive && "group-hover:bg-primary/40"
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
                      : "text-muted-foreground",
                    href && !isActive && "group-hover:text-foreground"
                  )}
                  aria-current={isActive ? "step" : undefined}
                >
                  {step.label}
                </span>
              </>
            );

            return (
              <li key={step.key}>
                {href ? (
                  // The label is hidden on narrow screens, which takes it out
                  // of the accessibility tree with it — so the link carries
                  // its own name rather than relying on the text being shown.
                  <Link
                    href={href}
                    aria-label={step.label}
                    className="group flex flex-col items-center gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex flex-col items-center gap-1.5">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

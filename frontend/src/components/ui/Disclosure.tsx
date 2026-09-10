"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * A titled section that starts folded.
 *
 * Exists because a storyboard is six scene cards deep and each one carried
 * its full setup panel, its whole composed prompt and a player, all open at
 * once. Everything shouted, so nothing was findable - the dialogue a creator
 * is actually judging sat between two walls of production detail. Folding
 * the detail leaves the spoken line as the thing you see.
 */
export function Disclosure({
  title,
  summary,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** One line of what is inside, so the fold can be judged without opening. */
  summary?: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div className="rounded-lg border border-border bg-muted/20">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors",
          "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        {badge}
        {summary && !open && (
          <span className="ml-auto truncate text-xs text-muted-foreground">{summary}</span>
        )}
      </button>

      {/* Unmounted rather than hidden: a folded section holds a whole setup
          panel, and keeping six of those mounted costs more than it saves. */}
      {open && (
        <div id={contentId} className="border-t border-border px-3 py-3">
          {children}
        </div>
      )}
    </div>
  );
}

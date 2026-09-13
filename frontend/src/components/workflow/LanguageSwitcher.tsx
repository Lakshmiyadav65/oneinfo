"use client";

import { useState } from "react";
import { Check, Globe } from "lucide-react";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "@/components/ui/Dropdown";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { updateProjectLanguage, type Retranslation } from "@/lib/api/projects";
import { PROJECT_LANGUAGES, type ProjectLanguage } from "@/types/project";
import { cn } from "@/lib/utils/cn";

/**
 * What was rewritten, as one sentence.
 *
 * Said in the creator's own terms - hooks, script, scenes - because the
 * point of naming them is to answer "did that touch the hook I picked?"
 * without making someone walk back through the steps to find out.
 */
function whatChanged(done: Retranslation): string | null {
  const parts: string[] = [];
  if (done.hooks > 0) parts.push(done.hooks === 1 ? "your hook" : `all ${done.hooks} hooks`);
  if (done.script) parts.push("your script");
  if (done.scenes > 0) parts.push(done.scenes === 1 ? "one scene" : `${done.scenes} scenes`);
  if (parts.length === 0) return null;

  const written =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Rewrote ${written}. Nothing was regenerated, so your choices and edits are as they were.`;
}

/**
 * Language, reachable from every step rather than only at creation.
 *
 * Changing it now carries the work with it, so the step showing the old
 * text has to be told to read itself again - which is what `onChanged` is
 * for. Without it the badge says one language and the page below it still
 * shows another, which is the state this was built to get rid of.
 */
export function LanguageSwitcher({
  projectId,
  language,
  onChanged,
}: {
  projectId: string;
  language: ProjectLanguage;
  /** The text on this step was rewritten and needs reading again. */
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [current, setCurrent] = useState<ProjectLanguage>(language);
  const [busy, setBusy] = useState(false);

  const active = PROJECT_LANGUAGES.find((l) => l.value === current);

  async function choose(next: ProjectLanguage) {
    if (next === current || busy) return;
    const previous = current;
    setCurrent(next);
    setBusy(true);
    try {
      const { retranslated } = await updateProjectLanguage(projectId, next);
      const label = PROJECT_LANGUAGES.find((l) => l.value === next)?.label ?? next;
      const stale = retranslated.scenes_with_clips;
      const rewritten = whatChanged(retranslated);
      toast({
        title: `Switched to ${label}`,
        description:
          [
            rewritten ?? "Everything from here on is written in it.",
            // Named rather than fixed: a clip costs money to make again, so
            // whether to redo it is the creator's call, not this dialog's.
            stale.length > 0
              ? `${stale.length === 1 ? "Scene" : "Scenes"} ${stale.join(", ")} ${
                  stale.length === 1 ? "has a clip" : "have clips"
                } in the old language. They are kept until you generate again.`
              : null,
          ]
            .filter(Boolean)
            .join(" "),
      });
      onChanged?.();
    } catch (err) {
      setCurrent(previous);
      toast({
        variant: "destructive",
        title: "Couldn't change the language",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dropdown>
      <DropdownTrigger
        disabled={busy}
        className={cn(
          "flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors",
          "hover:border-ring hover:bg-muted/50 disabled:opacity-60"
        )}
      >
        {/*
          A spinner, because this is no longer instant: it rewrites every
          hook, the script and the scene dialogue, and a control that has
          simply gone quiet for several seconds reads as a dead button.
        */}
        {busy ? (
          <Spinner className="size-4" />
        ) : (
          <Globe className="size-4 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="font-medium">
          {busy ? "Rewriting…" : (active?.label ?? current)}
        </span>
      </DropdownTrigger>
      <DropdownContent align="end">
        {PROJECT_LANGUAGES.map((option) => (
          <DropdownItem
            key={option.value}
            onSelect={() => void choose(option.value)}
            className="gap-2"
          >
            <Check
              className={cn("size-4", option.value === current ? "opacity-100" : "opacity-0")}
              aria-hidden="true"
            />
            <span>
              <span className="block">{option.label}</span>
              <span className="block text-xs text-muted-foreground">{option.hint}</span>
            </span>
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}

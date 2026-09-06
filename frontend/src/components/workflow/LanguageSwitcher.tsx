"use client";

import { useState } from "react";
import { Check, Globe } from "lucide-react";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { updateProjectLanguage } from "@/lib/api/projects";
import { PROJECT_LANGUAGES, type ProjectLanguage } from "@/types/project";
import { cn } from "@/lib/utils/cn";

/**
 * Language, reachable from every step rather than only at creation.
 *
 * Holds its own state instead of lifting it: each step fetches the project
 * independently, so threading a refetch through all of them would touch
 * every view to keep one label in sync.
 */
export function LanguageSwitcher({
  projectId,
  language,
}: {
  projectId: string;
  language: ProjectLanguage;
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
      await updateProjectLanguage(projectId, next);
      const label = PROJECT_LANGUAGES.find((l) => l.value === next)?.label ?? next;
      toast({
        title: `Switched to ${label}`,
        // Says plainly that nothing already written changes, so nobody
        // switches expecting their existing hooks to be translated.
        description: "Applies from the next generation. Anything already written stays as it is.",
      });
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
        <Globe className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="font-medium">{active?.label ?? current}</span>
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

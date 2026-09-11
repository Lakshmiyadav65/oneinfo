"use client";

import { useMemo, useState } from "react";
import { Replace } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";

/**
 * Correcting what a transcript says.
 *
 * Speech models get names wrong in a particular way: not randomly, but the
 * same way every time. A product said quickly comes back as the nearest
 * thing the model has heard before, and it comes back that way at every
 * mention. Fixing one and missing the other three is the obvious trap, so
 * the fix-everywhere box sits above the text rather than being something
 * you are expected to do by hand.
 */

/** Escaped, so a name with a dot or a bracket in it is searched literally. */
function pattern(term: string): RegExp {
  return new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
}

export function countOccurrences(text: string, term: string): number {
  if (!term) return 0;
  return text.match(pattern(term))?.length ?? 0;
}

export function replaceEverywhere(text: string, term: string, replacement: string): string {
  if (!term) return text;
  return text.replace(pattern(term), replacement);
}

export function KnowledgeEditor({
  value,
  onChange,
  onReplaced,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Told about each substitution, so it can be remembered for next time. */
  onReplaced: (heard: string, corrected: string) => void;
  disabled?: boolean;
}) {
  const [wrong, setWrong] = useState("");
  const [right, setRight] = useState("");

  // Counted as they type, so the button can say how much it is about to
  // change. "Replace" tells you nothing; "Replace 4" tells you whether you
  // typed the word you meant.
  const hits = useMemo(() => countOccurrences(value, wrong), [value, wrong]);

  function applyReplacement() {
    onChange(replaceEverywhere(value, wrong, right));
    // The same mistake will be in the next reel, and the one after that —
    // this is the moment the creator has told us what the right answer is,
    // so it is the moment worth recording it.
    onReplaced(wrong, right);
    setWrong("");
    setRight("");
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Fix a word everywhere
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <Label htmlFor="fix-wrong" className="sr-only">
              What it heard
            </Label>
            <Input
              id="fix-wrong"
              value={wrong}
              onChange={(e) => setWrong(e.target.value)}
              placeholder="What it heard"
              disabled={disabled}
              className="text-xs"
            />
          </div>
          <span className="pb-2 text-xs text-muted-foreground" aria-hidden="true">
            →
          </span>
          <div className="min-w-0 flex-1">
            <Label htmlFor="fix-right" className="sr-only">
              What you said
            </Label>
            <Input
              id="fix-right"
              value={right}
              onChange={(e) => setRight(e.target.value)}
              placeholder="What you said"
              disabled={disabled}
              className="text-xs"
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={applyReplacement}
            disabled={disabled || hits === 0 || !right.trim()}
          >
            <Replace className="size-3.5" />
            Replace{hits > 0 ? ` ${hits}` : ""}
          </Button>
        </div>
        {wrong.trim() !== "" && (
          <p className="mt-2 text-xs text-muted-foreground">
            {hits === 0
              ? `"${wrong}" is not in this transcript.`
              : `Found ${hits} ${hits === 1 ? "time" : "times"}. Capitalisation is ignored, and ` +
                `this fix will be applied to future transcripts too.`}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="transcript-body" className="sr-only">
          Transcript
        </Label>
        <Textarea
          id="transcript-body"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="min-h-60 w-full resize-y text-sm leading-7"
        />
      </div>
    </div>
  );
}

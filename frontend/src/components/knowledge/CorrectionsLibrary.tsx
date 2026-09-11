"use client";

import { useState } from "react";
import { ArrowRight, Plus, SpellCheck, Trash2 } from "lucide-react";
import { useAsyncData } from "@/hooks/useAsyncData";
import { addCorrection, deleteCorrection, listCorrections } from "@/lib/api/knowledge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/client";

/**
 * The words the transcriber reliably gets wrong for this creator.
 *
 * Shown rather than left to work silently in the background. These rewrite
 * every transcript from now on, and a substitution nobody can see is a
 * substitution nobody can debug — the first sign something is off would be
 * a word changing in a reel that never contained the mistake.
 */
export function CorrectionsLibrary() {
  const { toast } = useToast();
  const corrections = useAsyncData(listCorrections);
  const [heard, setHeard] = useState("");
  const [corrected, setCorrected] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      await addCorrection(heard, corrected);
      setHeard("");
      setCorrected("");
      corrections.retry();
    } catch (err) {
      toast({
        title: "Couldn't add that",
        description: err instanceof ApiError ? err.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, word: string) {
    try {
      await deleteCorrection(id);
      toast({ title: "Removed", description: `"${word}" is no longer corrected.` });
      corrections.retry();
    } catch {
      toast({ title: "Couldn't remove that", description: "Please try again." });
    }
  }

  const items = corrections.status === "success" ? corrections.data : [];

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Word corrections</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Names the transcriber mishears — a product or a brand it has never heard comes
          back as the nearest thing it knows, and it does that every time. Fixed here
          once, they are corrected in every transcript from now on.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <Label htmlFor="correction-heard" className="text-xs text-muted-foreground">
            What it hears
          </Label>
          <Input
            id="correction-heard"
            value={heard}
            onChange={(e) => setHeard(e.target.value)}
            placeholder="MagMain"
            disabled={busy}
          />
        </div>
        <ArrowRight
          className="mb-2.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <Label htmlFor="correction-corrected" className="text-xs text-muted-foreground">
            What you said
          </Label>
          <Input
            id="correction-corrected"
            value={corrected}
            onChange={(e) => setCorrected(e.target.value)}
            placeholder="Mac Mini"
            disabled={busy}
          />
        </div>
        <Button
          onClick={() => void add()}
          disabled={busy || !heard.trim() || !corrected.trim()}
        >
          {busy ? <Spinner className="size-4" /> : <Plus className="size-4" />}
          Add
        </Button>
      </div>

      {corrections.status === "loading" && <Skeleton className="h-12 w-full" />}

      {corrections.status === "error" && (
        <ErrorState description={corrections.message} onRetry={corrections.retry} />
      )}

      {corrections.status === "success" && items.length === 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <SpellCheck className="size-4 shrink-0" aria-hidden="true" />
          Nothing yet. Fixing a word while editing a transcript adds it here automatically.
        </p>
      )}

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((correction) => (
            <Card key={correction.id}>
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                  <span className="truncate text-muted-foreground line-through">
                    {correction.heard}
                  </span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium text-foreground">
                    {correction.corrected}
                  </span>
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void remove(correction.id, correction.heard)}
                  aria-label={`Stop correcting ${correction.heard}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Bookmark, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import {
  deleteEnvironmentSetup,
  listEnvironmentSetups,
  saveEnvironmentSetup,
} from "@/lib/api/environment-setups";
import type { SceneEnvironment } from "@/types/environment";
import type { EnvironmentSetupRecord } from "@/types/environment-setup";

/**
 * The creator's saved filming setups, above the preset chips.
 *
 * Saving and choosing both happen here rather than on a settings page: the
 * moment someone has a setup worth keeping is the moment they finish
 * building one, and sending them elsewhere to name it loses it.
 */
export function SavedSetups({
  environment,
  disabled = false,
  onApply,
}: {
  /** The setup currently on screen — what "Save this setup" would keep. */
  environment: SceneEnvironment;
  disabled?: boolean;
  onApply: (environment: SceneEnvironment) => void;
}) {
  const [setups, setSetups] = useState<EnvironmentSetupRecord[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    listEnvironmentSetups()
      .then((saved) => {
        if (!cancelled) setSetups(saved);
      })
      // A failure here costs the creator nothing: the preset chips below
      // still work, so it stays silent rather than throwing a toast over
      // a screen they came to for something else.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const saved = await saveEnvironmentSetup(trimmed, environment);
      setSetups((current) => [saved, ...current]);
      setNaming(false);
      setName("");
      toast({ title: `Saved "${saved.name}"`, description: "Reuse it on any project." });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't save this setup",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(setup: EnvironmentSetupRecord) {
    try {
      await deleteEnvironmentSetup(setup.id);
      setSetups((current) => current.filter((s) => s.id !== setup.id));
      // Worth saying out loud: deleting the entry looks destructive, and the
      // storyboards built from it are in fact untouched.
      toast({
        title: `Removed "${setup.name}"`,
        description: "Videos already using it are unchanged.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't remove this setup",
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Your saved setups
        </Label>
        {!naming && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => setNaming(true)}
          >
            <Bookmark className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Save this setup
          </Button>
        )}
      </div>

      {setups.length === 0 && !naming && (
        <p className="text-xs text-muted-foreground">
          Nothing saved yet. Build a look below, then save it to reuse on your next video.
        </p>
      )}

      {setups.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Saved setups">
          {setups.map((setup) => (
            <span
              key={setup.id}
              className={cn(
                "group flex items-center gap-1 rounded-full border border-border pl-3 pr-1 py-1 text-xs",
                disabled && "opacity-50"
              )}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onApply(setup.environment)}
                className="font-medium text-foreground disabled:cursor-not-allowed"
                title={setup.description ?? "Apply this setup"}
              >
                {setup.name}
              </button>
              {setup.is_default && (
                <Check className="h-3 w-3 text-primary" aria-label="Used for new videos" />
              )}
              <button
                type="button"
                disabled={disabled}
                onClick={() => handleDelete(setup)}
                aria-label={`Remove ${setup.name}`}
                className="rounded-full p-1 text-muted-foreground hover:text-destructive disabled:cursor-not-allowed"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      {naming && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1 space-y-1.5">
            <Label htmlFor="saved-setup-name">Name this setup</Label>
            <Input
              id="saved-setup-name"
              autoFocus
              value={name}
              maxLength={80}
              placeholder="Campus walk-and-talk"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") setNaming(false);
              }}
            />
          </div>
          <Button
            type="button"
            size="sm"
            isLoading={busy}
            disabled={busy || !name.trim()}
            onClick={handleSave}
          >
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setNaming(false)}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { OutputSettingsPanel } from "@/components/create/OutputSettingsPanel";
import { setOutputSettings } from "@/lib/api/projects";
import { sceneCost, storyboardCost } from "@/lib/workflow/scene-cost";
import { summarizeOutput } from "@/types/output-settings";
import type { OutputSettings } from "@/types/output-settings";
import type { Storyboard, StoryboardScene } from "@/types/storyboard";

/**
 * The settings, asked at the moment of spending rather than on arrival.
 *
 * They used to sit open on the storyboard step, which asked four cost
 * questions before the creator had decided to generate anything at all. They
 * are only ever consequential at the point of pressing Generate, so that is
 * where they are now put - and answering them there means the answer is
 * still fresh when the money goes.
 *
 * What is chosen here becomes the project's default, so it applies to every
 * clip rather than only the one being generated. Two clips of the same video
 * at different resolutions could not be stitched together anyway.
 */
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  output: OutputSettings;
  storyboard: Storyboard | null;
  /** Set for a one-scene preview; null for the whole video. */
  scene?: StoryboardScene | null;
  /** Runs after the settings are saved. This is what actually spends. */
  onConfirmed: () => void | Promise<void>;
};

/**
 * The draft lives in here rather than in the wrapper below, because the
 * dialog unmounts its content when closed. That makes the initial value the
 * reset: a cancelled edit is discarded by unmounting, with no effect
 * synchronising two copies of the same state.
 */
function GenerateDialogBody({
  onOpenChange,
  projectId,
  output,
  storyboard,
  scene = null,
  onConfirmed,
}: Omit<Props, "open">) {
  const { toast } = useToast();
  const [draft, setDraft] = useState(output);
  const [busy, setBusy] = useState(false);

  const price = scene
    ? sceneCost(scene.duration_seconds, scene.features_creator, draft)
    : storyboard
      ? storyboardCost(storyboard, draft)
      : null;

  async function handleConfirm() {
    setBusy(true);
    try {
      // Saved before generating, never after: the run has to use what the
      // creator just agreed to, and the estimate they just read was priced
      // on it.
      await setOutputSettings(projectId, draft);
      onOpenChange(false);
      await onConfirmed();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't start generating",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
          <DialogTitle>
            {scene ? `Generate scene ${scene.order}` : "Generate this video"}
          </DialogTitle>
          <DialogDescription>
            {scene
              ? "These settings apply to every clip in this video, not just this scene."
              : "Check these before spending. They apply to every clip in this video."}
          </DialogDescription>
        </DialogHeader>

        <OutputSettingsPanel
          output={draft}
          storyboard={storyboard}
          disabled={busy}
          showTotal={false}
          onChange={setDraft}
        />

      <DialogFooter className="items-center">
        {/* Flow puts this readout next to its send button, and it earns its
            place: it is the whole selection in one glance. */}
        <span className="mr-auto hidden text-xs tabular-nums text-muted-foreground sm:block">
          {summarizeOutput(draft)}
        </span>
        <Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button isLoading={busy} disabled={busy} onClick={() => void handleConfirm()}>
          {price ? `Generate — ${price}` : "Generate"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function GenerateDialog({ open, onOpenChange, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <GenerateDialogBody onOpenChange={onOpenChange} {...rest} />}
    </Dialog>
  );
}

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
import { Segmented } from "@/components/ui/Segmented";
import { setSceneDuration, setSceneOnCamera } from "@/lib/api/storyboard";
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
  /** Refreshes the storyboard after a clip length is changed, so the price
      beside Generate reflects the length that will actually be asked for. */
  onSceneChanged?: () => void;
};

/**
 * The lengths the video model will actually render.
 *
 * Veo generates fixed-length clips and nothing else. Ask for anything off
 * this list and the request comes back "Unsupported output video duration N
 * seconds, supported durations are [8,4,6]" - during the run, so the scenes
 * generated before the rejection have already been billed. That is why
 * these are buttons rather than a number field.
 *
 * Mirrors VeoVideoProvider.supported_durations. The server validates the
 * choice regardless, so drift here shows up as a refusal, not a bad clip.
 */
export const CLIP_LENGTHS = [4, 6, 8] as const;
// Reference-to-video is stricter: 8 seconds and nothing else while the
// creator is in frame.
const ON_CAMERA_LENGTH = 8;
// Auto is the absence of a choice, and Segmented values are numbers.
const AUTO = 0;

function ClipLength({
  projectId,
  scene,
  disabled,
  onChanged,
}: {
  projectId: string;
  scene: StoryboardScene;
  disabled: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  // A length the model cannot render while the creator is in frame, held
  // until they say whether to come out of frame for it.
  const [needsOffCamera, setNeedsOffCamera] = useState<number | null>(null);

  const spoken = scene.speech_seconds;
  const onCamera = scene.features_creator;

  async function choose(seconds: number) {
    const next = seconds === AUTO ? null : seconds;
    if (next === scene.duration_override) return;

    // On camera the model renders 8s and nothing else. That used to freeze
    // the whole control and point at a checkbox further down the card,
    // which is a choice the creator has to leave to make. The choice is
    // offered here instead - the length they clicked is what they want, and
    // coming off camera is the price of it.
    if (onCamera && next !== null && next !== ON_CAMERA_LENGTH) {
      setNeedsOffCamera(next);
      return;
    }
    await apply(next, false);
  }

  async function apply(next: number | null, leaveCamera: boolean) {
    setSaving(true);
    try {
      // Order matters: off camera first, or the server refuses the length
      // for a scene that is still in frame.
      if (leaveCamera) await setSceneOnCamera(projectId, scene.id, false);
      await setSceneDuration(projectId, scene.id, next);
      onChanged();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't set the clip length",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
      setNeedsOffCamera(null);
    }
  }

  return (
    <div className="space-y-2">
      <Segmented<number>
        label={`Clip length — scene ${scene.order}`}
        value={scene.duration_override ?? AUTO}
        disabled={disabled || saving}
        onChange={(seconds) => void choose(seconds)}
        options={[
          { value: AUTO, label: `Auto${scene.duration_override ? "" : ` · ${scene.duration_seconds}s`}` },
          ...CLIP_LENGTHS.map((seconds) => ({ value: seconds, label: `${seconds}s` })),
        ]}
      />
      {needsOffCamera !== null ? (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-border bg-muted/40 p-3"
        >
          <p className="text-xs text-foreground">
            The model only renders {ON_CAMERA_LENGTH}s clips with you in frame.
            A {needsOffCamera}s scene has to be b-roll — which also costs a
            fraction of an on-camera one.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void apply(needsOffCamera, true)}>
              Take me out and use {needsOffCamera}s
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setNeedsOffCamera(null)}
            >
              Keep me on camera
            </Button>
          </div>
        </div>
      ) : onCamera ? (
        <p className="text-xs text-muted-foreground">
          {ON_CAMERA_LENGTH}s is the only length the model renders while you are
          in frame. Pick a shorter one and this scene becomes b-roll.{" "}
          <span className="text-foreground">Auto</span> fits the length to the
          dialogue, which takes about {spoken.toFixed(1)}s to say.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Only 4, 6 and 8 second clips exist — the model renders nothing else.{" "}
          <span className="text-foreground">Auto</span> fits the length to this
          scene&apos;s dialogue, which takes about {spoken.toFixed(1)}s to say.
        </p>
      )}
      {!onCamera && scene.duration_override !== null && spoken > scene.duration_seconds * 1.18 && (
        <p className="text-xs text-destructive">
          That is shorter than the line. At {scene.duration_seconds}s the clip
          would end mid-sentence — shorten the dialogue or pick a longer clip.
        </p>
      )}
    </div>
  );
}

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
  onSceneChanged,
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

        {/*
          Per scene, unlike everything above it. A clip's length belongs to
          the clip - it is weighed against what that scene has to say - so it
          is the one control here that must not be applied to the whole video.
        */}
        {scene && onSceneChanged && (
          <ClipLength
            projectId={projectId}
            scene={scene}
            disabled={busy}
            onChanged={onSceneChanged}
          />
        )}

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

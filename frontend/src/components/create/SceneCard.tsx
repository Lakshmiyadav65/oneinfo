"use client";

import { useState } from "react";
import { EnvironmentSetup } from "@/components/create/EnvironmentSetup";
import { ScenePreview } from "@/components/create/ScenePreview";
import { CLIP_LENGTHS } from "@/components/create/GenerateDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { VisualPrompt } from "@/components/create/VisualPrompt";
import { Disclosure } from "@/components/ui/Disclosure";
import { cn } from "@/lib/utils/cn";
import { useToast } from "@/components/ui/Toast";
import {
  setSceneDialogue,
  setSceneEnvironment,
  setSceneInclusion,
  setSceneOnCamera,
  setSceneVisual,
} from "@/lib/api/storyboard";
import { onCameraSurcharge, sceneCost } from "@/lib/workflow/scene-cost";
import type { OutputSettings } from "@/types/output-settings";
import { presetLabel } from "@/types/environment";
import type { EnvironmentPreset, SceneEnvironment } from "@/types/environment";
import type { Storyboard, StoryboardScene } from "@/types/storyboard";

function errorDescription(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined;
}

// The longest clip that exists. A line past it cannot be given more room,
// so it is the one length worth warning about while the creator is typing.
const LONGEST_CLIP = Math.max(...CLIP_LENGTHS);

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * One scene: what is said, how it is filmed, who is in it.
 *
 * Content and production are kept apart all the way down the card. The
 * dialogue is the script's; the environment is the creator's direction; the
 * visual description is what those two become, and the only one of the three
 * the video model actually reads.
 */
export function SceneCard({
  projectId,
  scene,
  canGoOnCamera,
  output,
  storyboard,
  onRegenerated,
  onUpdated,
}: {
  projectId: string;
  scene: StoryboardScene;
  canGoOnCamera: boolean;
  /** Prices this scene: tier, resolution and take count all scale it. */
  output: OutputSettings;
  /** Prices the settings dialog's options against the whole video. */
  storyboard: Storyboard;
  /** The settings changed, so the project needs re-reading. */
  onRegenerated: () => void;
  onUpdated: (storyboard: Storyboard) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [editingVisual, setEditingVisual] = useState(false);
  const [visualDraft, setVisualDraft] = useState(scene.visual_prompt);
  const [editingLine, setEditingLine] = useState(false);
  const [lineDraft, setLineDraft] = useState(scene.voiceover);
  // Held back while the creator decides whether a setup change may rewrite a
  // visual description they wrote themselves.
  const [pending, setPending] = useState<{
    environment: SceneEnvironment;
    resetToPreset: boolean;
  } | null>(null);

  async function run(action: () => Promise<Storyboard>, title: string) {
    setBusy(true);
    try {
      onUpdated(await action());
    } catch (err) {
      toast({ variant: "destructive", title, description: errorDescription(err) });
    } finally {
      setBusy(false);
    }
  }

  function requestEnvironment(environment: SceneEnvironment, resetToPreset: boolean) {
    // Only a hand-written visual needs asking about. Anything else was
    // generated, so rebuilding it costs the creator nothing.
    if (scene.visual_is_custom) {
      setPending({ environment, resetToPreset });
      return;
    }
    void run(
      () => setSceneEnvironment(projectId, scene.id, environment, { resetToPreset }),
      "Couldn't update the setup"
    );
  }

  function resolvePending(rebuildVisual: boolean) {
    const choice = pending;
    setPending(null);
    if (!choice) return;
    void run(
      () =>
        setSceneEnvironment(projectId, scene.id, choice.environment, {
          resetToPreset: choice.resetToPreset,
          rebuildVisual,
        }),
      "Couldn't update the setup"
    );
  }

  async function setIncluded(included: boolean) {
    await run(
      () => setSceneInclusion(projectId, scene.id, included),
      included ? "Couldn't put this scene back" : "Couldn't leave this scene out"
    );
  }

  async function saveLine() {
    if (!lineDraft.trim()) return;
    await run(
      () => setSceneDialogue(projectId, scene.id, lineDraft),
      "Couldn't save the new line"
    );
    setEditingLine(false);
  }

  async function saveVisual() {
    await run(
      () => setSceneVisual(projectId, scene.id, visualDraft),
      "Couldn't save the visual description"
    );
    setEditingVisual(false);
  }

  // The server's own words-per-second, read back out of the line it just
  // measured. Taking the rate from the scene rather than restating it here
  // keeps one estimate in the product instead of two that drift apart.
  const savedWords = countWords(scene.voiceover);
  const secondsPerWord = savedWords > 0 ? scene.speech_seconds / savedWords : null;
  const draftSeconds =
    secondsPerWord === null ? null : secondsPerWord * countWords(lineDraft);
  const tooLongToRender = draftSeconds !== null && draftSeconds > LONGEST_CLIP;

  return (
    <Card
      className={cn(
        // A coloured spine, because an on-camera scene is the one that costs
        // three times the rest and is worth spotting while scrolling.
        "overflow-hidden border-l-4 transition-colors",
        scene.features_creator ? "border-l-primary" : "border-l-border"
      )}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
              scene.included_in_video
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            {scene.order}
          </span>
          {scene.features_creator && <Badge variant="info">You on camera</Badge>}
          {!scene.included_in_video && <Badge variant="default">Left out</Badge>}
          <span className="ml-auto flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
            <span className="rounded-md bg-muted px-1.5 py-0.5">
              {scene.duration_seconds}s
            </span>
            <span className="rounded-md bg-muted px-1.5 py-0.5">
              {sceneCost(scene.duration_seconds, scene.features_creator, output)}
            </span>
          </span>
        </div>

        {/*
          The spoken line leads the card, and is the only thing on it that
          never folds. It is what the creator is really judging - what the
          person on screen actually says - and everything else here is
          production detail about how it gets filmed.
        */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-primary">
              Dialogue
            </span>
            {!editingLine && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setLineDraft(scene.voiceover);
                  setEditingLine(true);
                }}
              >
                Edit the line
              </Button>
            )}
          </div>

          {editingLine ? (
            <div className="space-y-2">
              <Textarea
                aria-label={`Dialogue for scene ${scene.order}`}
                rows={3}
                value={lineDraft}
                disabled={busy}
                onChange={(e) => setLineDraft(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {draftSeconds !== null
                  ? `About ${draftSeconds.toFixed(1)}s to say.`
                  : "Saving fits the clip to the words."}{" "}
                {scene.duration_override === null
                  ? "The clip length follows this line."
                  : `The clip stays at ${scene.duration_seconds}s, because you chose that length.`}
              </p>
              {tooLongToRender && (
                <p className="text-xs text-destructive">
                  Longer than the {LONGEST_CLIP}s clip the video model can make.
                  Trim it, or leave it and the ending will be cut off.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => void saveLine()}
                  isLoading={busy}
                  disabled={!lineDraft.trim()}
                >
                  Save line
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditingLine(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="rounded-lg border-l-2 border-primary/40 bg-muted/30 px-3 py-2 text-sm leading-relaxed text-foreground">
              {scene.voiceover}
            </p>
          )}

          {/*
            Shown whether or not the editor is open: a line that overruns its
            clip is generated with its ending cut off, and that is worth
            knowing before paying to hear it.
          */}
          {!editingLine && scene.speech_seconds > scene.duration_seconds && (
            <p className="text-xs text-destructive">
              About {scene.speech_seconds.toFixed(1)}s to say in a{" "}
              {scene.duration_seconds}s clip, so the end will be cut off.
            </p>
          )}
        </div>

        <Disclosure
          title="Look & setup"
          summary={presetLabel(scene.environment.preset)}
        >
          <EnvironmentSetup
            idPrefix={`scene-${scene.id}`}
            environment={scene.environment}
            disabled={busy}
            onPresetChange={(preset: EnvironmentPreset) =>
              requestEnvironment({ ...scene.environment, preset }, true)
            }
            onChange={(environment) => requestEnvironment(environment, false)}
          />
        </Disclosure>

        {pending && (
          <div
            role="alert"
            className="space-y-2 rounded-md border border-border bg-muted/40 p-3"
          >
            <p className="text-sm text-foreground">
              Changing the setup may update the visual description, and you have
              edited this one yourself.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => resolvePending(true)}>
                Update visual
              </Button>
              <Button variant="secondary" size="sm" onClick={() => resolvePending(false)}>
                Keep my current visual
              </Button>
            </div>
          </div>
        )}

        {/*
          Folded by default. It is the longest thing on the card by far and
          the creator did not write it - it is generated from the setup
          above, and only worth opening when something looks wrong.
        */}
        <Disclosure
          title="Prompt sent to the model"
          summary="Scene, dialogue, camera, negatives"
          badge={
            scene.visual_is_custom ? (
              <Badge variant="default">Edited by you</Badge>
            ) : undefined
          }
        >
          {editingVisual ? (
            <div className="space-y-2">
              <Textarea
                aria-label={`Visual description for scene ${scene.order}`}
                rows={10}
                value={visualDraft}
                disabled={busy}
                onChange={(e) => setVisualDraft(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void saveVisual()} isLoading={busy}>
                  Save visual
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditingVisual(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <VisualPrompt prompt={scene.visual_prompt} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setVisualDraft(scene.visual_prompt);
                  setEditingVisual(true);
                }}
              >
                Edit the prompt
              </Button>
            </div>
          )}
        </Disclosure>

        {/*
          The costliest decision on the page, so it is given the weight of
          one: the difference between a b-roll scene and one billed at three
          times the rate.
        */}
        <label
          className={cn(
            "flex cursor-pointer flex-wrap items-center gap-2 rounded-md border p-3 text-sm transition-colors",
            scene.features_creator
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border text-foreground hover:border-ring hover:bg-muted/50",
            !canGoOnCamera && "cursor-not-allowed opacity-60"
          )}
        >
          <input
            type="checkbox"
            className="size-4 shrink-0 accent-[var(--primary)]"
            checked={scene.features_creator}
            disabled={busy || !canGoOnCamera}
            onChange={(event) =>
              void run(
                () => setSceneOnCamera(projectId, scene.id, event.target.checked),
                event.target.checked ? "Can't put you on camera" : "Couldn't update the scene"
              )
            }
          />
          <span className="font-medium">
            {canGoOnCamera
              ? "Put me on camera in this scene"
              : "Put me on camera (add a photo first)"}
          </span>
          {canGoOnCamera && !scene.features_creator && (
            <span className="text-xs text-muted-foreground">
              becomes 8s &middot; +{onCameraSurcharge(scene.duration_seconds, output)}
            </span>
          )}
        </label>

        {/*
          Said out loud, because "off" used to mean something nobody had
          decided. The prompt named no one and the model cast a presenter of
          its own, so a video cut from the creator to a stranger reading
          their script. Off now means nobody is in the shot, and this is
          where that is stated.
        */}
        {!scene.features_creator &&
          scene.environment.subject !== "people" && (
            <p className="pl-6 text-xs text-muted-foreground">
              B-roll: nobody on camera. Set{" "}
              <span className="text-foreground">Look &amp; setup</span> to
              People if this shot should have someone in it.
            </p>
          )}

        {/*
          Offered here as well as on the generate grid, because here it is
          worth money: a scene dropped before the run is a scene nobody pays
          to make. The clip and the scene are kept either way.
        */}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={scene.included_in_video}
            disabled={busy}
            onChange={(e) => void setIncluded(e.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          <span
            className={
              scene.included_in_video ? "text-foreground" : "text-muted-foreground"
            }
          >
            Include this scene in the video
          </span>
        </label>

        <ScenePreview
          projectId={projectId}
          scene={scene}
          output={output}
          storyboard={storyboard}
          onSettingsSaved={onRegenerated}
        />
      </CardContent>
    </Card>
  );
}

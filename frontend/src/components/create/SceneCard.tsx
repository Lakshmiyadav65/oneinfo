"use client";

import { useState } from "react";
import { EnvironmentSetup } from "@/components/create/EnvironmentSetup";
import { ScenePreview } from "@/components/create/ScenePreview";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { VisualPrompt } from "@/components/create/VisualPrompt";
import { useToast } from "@/components/ui/Toast";
import {
  setSceneEnvironment,
  setSceneOnCamera,
  setSceneVisual,
} from "@/lib/api/storyboard";
import { onCameraSurcharge, sceneCost } from "@/lib/workflow/scene-cost";
import type { OutputSettings } from "@/types/output-settings";
import { cn } from "@/lib/utils/cn";
import type { EnvironmentPreset, SceneEnvironment } from "@/types/environment";
import type { Storyboard, StoryboardScene } from "@/types/storyboard";

function errorDescription(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
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
  onUpdated,
}: {
  projectId: string;
  scene: StoryboardScene;
  canGoOnCamera: boolean;
  /** Prices this scene: tier, resolution and take count all scale it. */
  output: OutputSettings;
  onUpdated: (storyboard: Storyboard) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [editingVisual, setEditingVisual] = useState(false);
  const [visualDraft, setVisualDraft] = useState(scene.visual_prompt);
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

  async function saveVisual() {
    await run(
      () => setSceneVisual(projectId, scene.id, visualDraft),
      "Couldn't save the visual description"
    );
    setEditingVisual(false);
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">Scene {scene.order}</p>
            {scene.features_creator && <Badge variant="info">You</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            {scene.duration_seconds}s &middot;{" "}
            {sceneCost(scene.duration_seconds, scene.features_creator, output)}
          </p>
        </div>

        {/*
          The spoken line leads the card. It is the one thing on a scene the
          creator is really judging - what the person on screen actually says.
        */}
        <div className="space-y-1">
          <span className="inline-flex rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-primary">
            Dialogue
          </span>
          <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm leading-relaxed text-foreground">
            {scene.voiceover}
          </p>
        </div>

        <div className="border-t border-border pt-3">
          <EnvironmentSetup
            idPrefix={`scene-${scene.id}`}
            environment={scene.environment}
            disabled={busy}
            onPresetChange={(preset: EnvironmentPreset) =>
              requestEnvironment({ ...scene.environment, preset }, true)
            }
            onChange={(environment) => requestEnvironment(environment, false)}
          />
        </div>

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

        <div className="space-y-1.5 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>Visual</SectionLabel>
            {!editingVisual && (
              <button
                type="button"
                onClick={() => {
                  setVisualDraft(scene.visual_prompt);
                  setEditingVisual(true);
                }}
                className="rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Edit
              </button>
            )}
          </div>
          {editingVisual ? (
            <div className="space-y-2">
              <Textarea
                aria-label={`Visual description for scene ${scene.order}`}
                rows={4}
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
            <div className="space-y-1">
              <VisualPrompt prompt={scene.visual_prompt} />
              {scene.visual_is_custom && (
                <p className="text-xs text-foreground">(edited by you)</p>
              )}
            </div>
          )}
        </div>

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

        <ScenePreview
          projectId={projectId}
          sceneId={scene.id}
          cost={sceneCost(scene.duration_seconds, scene.features_creator, output)}
        />
      </CardContent>
    </Card>
  );
}

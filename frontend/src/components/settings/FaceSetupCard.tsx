"use client";

import { useRef, useState } from "react";
import { useAsyncData } from "@/hooks/useAsyncData";
import {
  deleteFaceImage,
  getFaceSetup,
  grantFaceConsent,
  revokeFaceConsent,
  updateFaceDescriptions,
  uploadFaceImage,
} from "@/lib/api/creator-face";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import type { FaceSetup } from "@/types/creator-face";

function errorDescription(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined;
}

/**
 * The photo guidance is not decoration. A dim, cluttered reference photo
 * produces a noticeably worse likeness, and each regeneration costs real
 * money — so the requirements are stated before the file picker, not after
 * an upload fails.
 */
const PHOTO_TIPS = [
  "Straight on, looking at the camera, neutral expression",
  "Bright, even light — daylight beats a dim room",
  "Just you in frame, nothing distracting behind you",
  "No sunglasses, hat, or heavy filters",
  "Wear what you want to appear in — your outfit is copied into the video",
];

export function FaceSetupCard() {
  const { toast } = useToast();
  const query = useAsyncData(() => getFaceSetup(), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<FaceSetup | null>(null);
  const [appearance, setAppearance] = useState<string | null>(null);
  const [voice, setVoice] = useState<string | null>(null);

  const data = setup ?? (query.status === "success" ? query.data : null);

  // Local edits win until saved, so typing isn't clobbered by a refetch.
  const appearanceValue = appearance ?? data?.appearance_description ?? "";
  const voiceValue = voice ?? data?.voice_description ?? "";

  async function run(action: () => Promise<FaceSetup | void>, failure: string) {
    setBusy(true);
    try {
      const next = await action();
      if (next) setSetup(next);
      else setSetup(await getFaceSetup());
    } catch (err) {
      toast({ variant: "destructive", title: failure, description: errorDescription(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset immediately so picking the same file twice still fires onChange.
    event.target.value = "";
    if (!file) return;
    await run(async () => {
      await uploadFaceImage(file);
      return getFaceSetup();
    }, "Couldn't add that photo");
  }

  if (query.status === "loading") {
    return <Skeleton className="h-64 w-full" />;
  }
  if (query.status === "error") {
    return <ErrorState description={query.message} onRetry={query.retry} />;
  }
  if (!data) return null;

  const remaining = data.max_images - data.images.length;

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">Your face in videos</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add photos and we can put you on camera instead of a stranger.
            </p>
          </div>
          <Badge variant={data.ready_for_generation ? "success" : "default"}>
            {data.ready_for_generation ? "Ready" : "Not set up"}
          </Badge>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Reference photos</Label>
            <span className="text-xs text-muted-foreground">
              {data.images.length} of {data.max_images}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {data.images.map((image) => (
              <div
                key={image.id}
                className="flex flex-col justify-between rounded-md border border-border bg-muted/30 p-3"
              >
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    {image.position === 0 ? "Primary" : `Photo ${image.position + 1}`}
                  </p>
                  <p className="mt-1">
                    {image.width}×{image.height}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 self-start px-0 text-destructive"
                  disabled={busy}
                  onClick={() =>
                    void run(() => deleteFaceImage(image.id), "Couldn't remove that photo")
                  }
                >
                  Remove
                </Button>
              </div>
            ))}

            {remaining > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
                className="flex min-h-24 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground transition hover:border-primary hover:text-foreground disabled:opacity-50"
              >
                + Add photo
              </button>
            )}
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={(event) => void handleFile(event)}
          />

          <div className="rounded-md bg-muted/40 p-3">
            <p className="text-xs font-medium text-foreground">What makes a good photo</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
              {PHOTO_TIPS.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Two or three photos give a noticeably better likeness than one.
            </p>
          </div>
        </div>

        <div className="space-y-3 border-t border-border pt-5">
          <Label htmlFor="face-consent" className="flex items-start gap-2.5">
            <input
              id="face-consent"
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0"
              checked={data.consent_granted}
              disabled={busy}
              onChange={(event) =>
                void run(
                  () => (event.target.checked ? grantFaceConsent() : revokeFaceConsent()),
                  "Couldn't update consent"
                )
              }
            />
            <span className="text-sm font-normal text-foreground">
              I agree to my likeness being used to generate videos of me, and confirm
              these photos are of me.
            </span>
          </Label>
          {data.consent_granted && data.consent_at && (
            <p className="pl-6 text-xs text-muted-foreground">
              Agreed {new Date(data.consent_at).toLocaleDateString()}. You can withdraw
              this at any time — your photos stay until you delete them.
            </p>
          )}
        </div>

        <div className="space-y-4 border-t border-border pt-5">
          <div className="space-y-1.5">
            <Label htmlFor="face-appearance">How you look</Label>
            <Textarea
              id="face-appearance"
              rows={2}
              value={appearanceValue}
              onChange={(event) => setAppearance(event.target.value)}
              placeholder="e.g. A woman in her thirties with shoulder-length dark hair, wearing a navy shirt"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="face-voice">How you sound</Label>
            <Textarea
              id="face-voice"
              rows={2}
              value={voiceValue}
              onChange={(event) => setVoice(event.target.value)}
              placeholder="e.g. Warm, conversational, Indian English accent"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            These are repeated word for word into every scene you appear in. The video
            model has no memory between scenes, so identical wording is what keeps you
            looking and sounding the same from one cut to the next.
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  updateFaceDescriptions({
                    appearance_description: appearanceValue,
                    voice_description: voiceValue,
                  }),
                "Couldn't save descriptions"
              ).then(() => {
                setAppearance(null);
                setVoice(null);
              })
            }
          >
            Save descriptions
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

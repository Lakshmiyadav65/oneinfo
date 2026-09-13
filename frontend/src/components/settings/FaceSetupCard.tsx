"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useAsyncData } from "@/hooks/useAsyncData";
import {
  deleteFaceImage,
  getFaceSetup,
  previewVoice,
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
  const [speaker, setSpeaker] = useState<string | null>(null);
  const [listening, setListening] = useState<string | null>(null);
  // Held outside state so a second preview can stop the first, and so the
  // object URL can be revoked without waiting for a render.
  const playing = useRef<{ audio: HTMLAudioElement; url: string } | null>(null);

  const data = setup ?? (query.status === "success" ? query.data : null);

  // Local edits win until saved, so typing isn't clobbered by a refetch.
  const appearanceValue = appearance ?? data?.appearance_description ?? "";
  const voiceValue = voice ?? data?.voice_description ?? "";
  const speakerValue = speaker ?? data?.speech_speaker ?? "";

  async function hear(name: string) {
    if (!name) return;
    playing.current?.audio.pause();
    if (playing.current) URL.revokeObjectURL(playing.current.url);
    playing.current = null;
    setListening(name);
    try {
      // English, because the sample is being judged as a voice rather than
      // as a reading of any particular project's script.
      const blob = await previewVoice(name, "english");
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      playing.current = { audio, url };
      audio.onended = () => setListening(null);
      await audio.play();
    } catch (err) {
      setListening(null);
      toast({
        variant: "destructive",
        title: "Couldn't play that voice",
        description: errorDescription(err),
      });
    }
  }

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
            <h3 className="text-base font-semibold text-foreground">Reference photos</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              What the video model actually works from. Recording your avatar fills
              these in, and that happens in{" "}
              <Link href="/create" className="underline hover:text-foreground">
                Create Video
              </Link>
              , where it is any use. Upload by hand here if you have no camera.
            </p>
          </div>
          <Badge variant={data.ready_for_generation ? "success" : "default"}>
            {data.ready_for_generation ? "Ready" : "Not set up"}
          </Badge>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Photos on file</Label>
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
                  <p className="font-medium capitalize text-foreground">
                    {/* An angle means this came from a capture, and naming it
                        is more use than "Photo 2". */}
                    {image.angle ?? (image.position === 0 ? "Primary" : `Photo ${image.position + 1}`)}
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

        {/* Consent is GIVEN in the create flow, at the moment someone asks
            to be in a video. It is WITHDRAWN here, because withdrawing is
            not something anyone does while starting a video, and a decision
            this one has to be reversible somewhere obvious. */}
        {data.consent_granted && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              You agreed to your likeness being used to generate videos of you
              {data.consent_at ? ` on ${new Date(data.consent_at).toLocaleDateString()}` : ""}.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="px-0 text-destructive"
              disabled={busy}
              onClick={() => void run(() => revokeFaceConsent(), "Couldn't withdraw that")}
            >
              Withdraw consent
            </Button>
            <p className="text-xs text-muted-foreground">
              Stops you being generated into any new scene straight away. Your photos
              and recording stay until you delete them.
            </p>
          </div>
        )}

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
            Repeated word for word into the prompt: how you look, into the scenes you
            appear in; how you sound, into every scene, b-roll included. The video
            model has no memory between scenes, so identical wording is what keeps you
            looking and sounding the same from one cut to the next.
          </p>
          {/*
            Said here because the field being empty has a visible, confusing
            result rather than a neutral one. Told nothing about the
            narrator, the model casts one per clip - a woman reading one
            scene and a man the next, inside one video.
          */}
          {!voiceValue.trim() && (
            <p className="text-xs text-muted-foreground">
              With this empty, the model picks a narrator for each clip on its own,
              and they will not match. Describing your voice once is what stops that.
            </p>
          )}

          {/*
            The description above asks the video model for a voice, which it
            can decline - it generates every clip with no memory of the last.
            This one is a guarantee: the same speaker reads every scene,
            because the words are synthesised rather than invented.

            Named, not labelled. Which of these is right is a judgement about
            a voice, so the honest way to present them is to let one be
            heard rather than to write "warm female" beside a name.
          */}
          <div className="space-y-1.5 border-t border-border pt-4">
            <Label htmlFor="face-speaker">The voice that reads your scenes</Label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                id="face-speaker"
                className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                value={speakerValue}
                disabled={busy || (data?.speech_speakers.length ?? 0) === 0}
                onChange={(event) => setSpeaker(event.target.value)}
              >
                <option value="">The default voice</option>
                {(data?.speech_speakers ?? []).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                size="sm"
                disabled={!speakerValue || listening !== null}
                isLoading={listening !== null}
                onClick={() => void hear(speakerValue)}
              >
                Hear it
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Used by{" "}
              <span className="text-foreground">Use one voice for every scene</span>{" "}
              on the storyboard step, which replaces what the video model said
              with this voice. Free, and the only way a whole video is
              guaranteed to sound like one person.
            </p>
          </div>
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
                    speech_speaker: speakerValue,
                  }),
                "Couldn't save descriptions"
              ).then(() => {
                setAppearance(null);
                setVoice(null);
                setSpeaker(null);
              })
            }
          >
            Save voice and appearance
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

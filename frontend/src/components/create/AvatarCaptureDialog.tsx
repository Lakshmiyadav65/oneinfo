"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { useToast } from "@/components/ui/Toast";
import { grantFaceConsent, uploadAvatarCapture } from "@/lib/api/creator-face";
import { ANGLE_INSTRUCTIONS, ANGLE_ORDER, type AngleName } from "@/lib/avatar/tracking";
import { isCaptureSupported, useCaptureSession } from "@/lib/avatar/useCaptureSession";

/**
 * The avatar capture, given the whole screen.
 *
 * A live camera session competes with everything around it, so it gets a
 * dialog rather than a card wedged above the idea form. Closing it unmounts
 * the session, and the hook's cleanup stops the camera - a preview left
 * running behind a closed dialog is the one outcome worse than no preview.
 *
 * Consent is asked for here, not somewhere else. Being told you need to
 * agree to something and then sent to Settings to do it is not being asked.
 */

const SCRIPT_LINE =
  "Hi, I'm recording this so I can present my own videos. I'll turn my head slowly now.";

const STAGE_TITLE: Record<string, string> = {
  starting: "Opening your camera…",
  framing: "Getting you in frame",
  front: ANGLE_INSTRUCTIONS.front,
  left: ANGLE_INSTRUCTIONS.left,
  right: ANGLE_INSTRUCTIONS.right,
};

function AngleDots({ done, current }: { done: number; current: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {ANGLE_ORDER.map((angle, index) => (
        <span
          key={angle}
          className={
            index < done
              ? "h-1.5 w-10 rounded-full bg-primary"
              : angle === current
                ? "h-1.5 w-10 rounded-full bg-primary/40"
                : "h-1.5 w-10 rounded-full bg-muted"
          }
        />
      ))}
    </div>
  );
}

export function AvatarCaptureDialog({
  open,
  onOpenChange,
  consentGranted,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consentGranted: boolean;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { stage, guidance, dwell, error, result, videoRef, brightnessCanvasRef, start, cancel, discard } =
    useCaptureSession();
  const [agreed, setAgreed] = useState(consentGranted);
  const [busy, setBusy] = useState(false);

  const supported = isCaptureSupported();
  const active = stage === "starting" || stage === "framing" || ANGLE_ORDER.includes(stage as AngleName);
  const doneCount = ANGLE_ORDER.indexOf(stage as AngleName);

  async function beginRecording() {
    // Record the agreement before the camera opens, so a session that is
    // abandoned halfway still leaves consent where the creator put it.
    if (!consentGranted) {
      try {
        await grantFaceConsent();
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Couldn't save that agreement",
          description: err instanceof Error ? err.message : undefined,
        });
        return;
      }
    }
    await start();
  }

  /**
   * A failed upload keeps the take. Re-recording is a minute of someone's
   * time and a second camera prompt, and the blob is already in hand.
   */
  async function saveTake() {
    if (!result) return;
    setBusy(true);
    try {
      await uploadAvatarCapture({
        take: result.take,
        frames: result.frames,
        angles: result.angles,
      });
      onSaved();
      discard();
      onOpenChange(false);
      toast({ title: "Your avatar is ready", description: "You can now appear in your videos." });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't save that recording",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-session has to stop the camera, not just hide it.
        if (!next) {
          cancel();
          discard();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record your avatar</DialogTitle>
          <DialogDescription>
            About twenty seconds. Read a line aloud while you slowly turn your head, and
            we take the three angles the video model needs.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
            {error}
          </p>
        )}

        {!supported && stage === "idle" && (
          <p className="mb-4 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
            This browser can&apos;t record video. Close this and upload photos instead —
            they work the same way, they just take more care to get right.
          </p>
        )}

        {stage === "idle" && (
          <div className="space-y-4">
            <ol className="space-y-2 text-sm text-muted-foreground">
              {ANGLE_ORDER.map((angle, index) => (
                <li key={angle} className="flex gap-3">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
                    {index + 1}
                  </span>
                  {ANGLE_INSTRUCTIONS[angle]}
                </li>
              ))}
            </ol>
            <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              Wear what you want to appear in. Your outfit and the light are copied into
              every video you appear in, so one recording keeps you looking the same from
              one cut to the next.
            </p>

            <label className="flex items-start gap-2.5 border-t border-border pt-4">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
              />
              <span className="text-xs text-foreground">
                I agree to my likeness being used to generate videos of me, and confirm
                this is me. The recording is stored so my angles can be re-cut, and I can
                delete it at any time in Settings.
              </span>
            </label>

            <Button disabled={!supported || !agreed} onClick={() => void beginRecording()}>
              Start recording
            </Button>
          </div>
        )}

        {/* Mirrored so it behaves like a mirror. Landmarks come from the raw
            frame and are unaffected, so "turn left" means the same thing. */}
        {active && (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-lg border border-border bg-black">
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                className="aspect-video w-full -scale-x-100 object-cover"
              />
              <canvas ref={brightnessCanvasRef} className="hidden" />
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-base font-medium text-foreground">{STAGE_TITLE[stage]}</p>
              <AngleDots done={Math.max(0, doneCount)} current={stage} />
            </div>
            <Progress value={dwell * 100} />
            <p className="text-sm text-muted-foreground">{guidance}</p>
            <p className="rounded-md bg-muted/40 p-3 text-sm text-foreground">
              Read this aloud while you turn: &ldquo;{SCRIPT_LINE}&rdquo;
            </p>
            <Button variant="ghost" size="sm" onClick={cancel}>
              Stop
            </Button>
          </div>
        )}

        {stage === "review" && result && (
          <div className="space-y-3">
            {/* The recording, not the camera: its tracks stopped the moment
                the last angle locked, so the preview is dead by now. */}
            <video
              src={result.takeUrl}
              controls
              playsInline
              className="aspect-video w-full rounded-lg border border-border bg-black object-cover"
            />
            <div className="grid grid-cols-3 gap-3">
              {result.previews.map((url, index) => (
                <div key={url} className="space-y-1">
                  {/* Object URL from a canvas grab: next/image can't take a
                      blob URL and there is nothing to optimise locally. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Your ${result.angles[index]?.angle} reference frame`}
                    className="aspect-square w-full rounded-md border border-border object-cover"
                  />
                  <p className="text-center text-[11px] capitalize text-muted-foreground">
                    {result.angles[index]?.angle}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Using this replaces any reference photos you already have.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} isLoading={busy} onClick={() => void saveTake()}>
                Use this
              </Button>
              <Button variant="secondary" disabled={busy} onClick={discard}>
                Record again
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

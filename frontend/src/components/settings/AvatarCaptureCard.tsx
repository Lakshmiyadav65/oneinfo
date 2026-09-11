"use client";

import { useState, useSyncExternalStore } from "react";
import { useAsyncData } from "@/hooks/useAsyncData";
import {
  deleteAvatarRecording,
  getFaceSetup,
  grantFaceConsent,
  revokeFaceConsent,
  uploadAvatarCapture,
} from "@/lib/api/creator-face";
import {
  ANGLE_INSTRUCTIONS,
  ANGLE_ORDER,
  type AngleName,
} from "@/lib/avatar/tracking";
import { isCaptureSupported, useCaptureSession } from "@/lib/avatar/useCaptureSession";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import type { FaceSetup } from "@/types/creator-face";

/**
 * The creator's avatar, recorded rather than assembled from photos.
 *
 * One session: they read a line aloud while slowly turning their head, and
 * the browser confirms each angle only once it has measured the turn. Three
 * frames from one take share an outfit, a light and a background, which is
 * the consistency that makes a generated scene look like the same person
 * from one cut to the next.
 *
 * Renders in every state, including failure, and every failure names the
 * photo upload below it. A camera that can't be opened must not leave the
 * creator with no way to appear in their own video.
 */

/**
 * Something to say while filming. The words don't matter — a moving mouth
 * and a relaxed face do, and reading beats being told to "act natural".
 */
const SCRIPT_LINE =
  "Hi, I'm recording this so I can present my own videos. I'll turn my head slowly now.";

const STAGE_TITLE: Record<string, string> = {
  starting: "Opening your camera…",
  framing: "Getting you in frame",
  front: ANGLE_INSTRUCTIONS.front,
  left: ANGLE_INSTRUCTIONS.left,
  right: ANGLE_INSTRUCTIONS.right,
  review: "How does that look?",
};

function AngleDots({ done, current }: { done: number; current: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {ANGLE_ORDER.map((angle, index) => (
        <span
          key={angle}
          className={
            index < done
              ? "h-1.5 w-8 rounded-full bg-primary"
              : angle === current
                ? "h-1.5 w-8 rounded-full bg-primary/40"
                : "h-1.5 w-8 rounded-full bg-muted"
          }
        />
      ))}
    </div>
  );
}

export function AvatarCaptureCard({ onChange }: { onChange?: () => void }) {
  const { toast } = useToast();
  const query = useAsyncData(() => getFaceSetup(), []);
  const {
    stage,
    guidance,
    dwell,
    error: captureError,
    result,
    videoRef,
    brightnessCanvasRef,
    start,
    cancel,
    discard,
  } = useCaptureSession();
  const [local, setLocal] = useState<FaceSetup | null>(null);
  const [busy, setBusy] = useState(false);

  // Feature detection reads navigator, which doesn't exist on the server.
  // The server snapshot says "supported" so the card renders its ordinary
  // self and only falls back once the browser has actually been asked.
  const supported = useSyncExternalStore(
    () => () => {},
    isCaptureSupported,
    () => true
  );

  const setup = local ?? (query.status === "success" ? query.data : null);
  const loading = query.status === "loading" && local === null;
  const consent = setup?.consent_granted ?? false;
  const recording = setup?.recording ?? null;
  const capturedFrames = (setup?.images ?? []).filter((image) => image.angle !== null);

  async function run(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    try {
      await action();
      setLocal(await getFaceSetup());
      onChange?.();
    } catch (err) {
      toast({
        variant: "destructive",
        title: failure,
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  /**
   * Doesn't use `run`, because a failed upload must not throw the take away.
   * Re-recording is a minute of someone's time and a second camera prompt;
   * keeping the blob and letting them press the button again costs nothing.
   */
  async function saveTake() {
    if (!result) return;
    setBusy(true);
    try {
      setLocal(
        await uploadAvatarCapture({
          take: result.take,
          frames: result.frames,
          angles: result.angles,
        })
      );
      onChange?.();
      discard();
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

  const active =
    stage === "starting" ||
    stage === "framing" ||
    ANGLE_ORDER.includes(stage as AngleName);
  const doneCount = ANGLE_ORDER.indexOf(stage as AngleName);

  return (
    <Card className={capturedFrames.length > 0 ? "border-border" : "border-primary/25 bg-primary/5"}>
      <CardContent className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
              Record your avatar
              {loading && <Spinner className="h-3.5 w-3.5" />}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              One short recording, turning your head, and we can put you on camera
              instead of a stranger.
            </p>
          </div>
          <Badge variant={capturedFrames.length === ANGLE_ORDER.length ? "success" : "default"}>
            {capturedFrames.length === ANGLE_ORDER.length ? "Recorded" : "Not recorded"}
          </Badge>
        </div>

        {captureError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
            {captureError}
          </p>
        )}

        {!supported && (
          <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
            This browser can&apos;t record video. Add reference photos below instead —
            they work the same way, they just take more care to get right.
          </p>
        )}

        {/* The live session. The preview is mirrored so it behaves like a
            mirror; landmarks come from the raw frame and are unaffected. */}
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
              <p className="text-sm font-medium text-foreground">{STAGE_TITLE[stage]}</p>
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
            <p className="text-sm font-medium text-foreground">{STAGE_TITLE.review}</p>
            {/* The recording, not the camera: its tracks were stopped the
                moment the last angle locked, so the live preview is dead by
                now and would show a frozen frame. */}
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
                    alt={`Your ${result?.angles[index]?.angle} reference frame`}
                    className="aspect-square w-full rounded-md border border-border object-cover"
                  />
                  <p className="text-center text-[11px] capitalize text-muted-foreground">
                    {result?.angles[index]?.angle}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} isLoading={busy} onClick={() => void saveTake()}>
                Use this
              </Button>
              <Button variant="secondary" size="sm" disabled={busy} onClick={discard}>
                Record again
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Using this replaces any reference photos you already have. Three frames
              from one recording keep your outfit and lighting consistent, which is
              what the video model needs.
            </p>
          </div>
        )}

        {/* Idle: what's on file, and the way in. */}
        {!active && stage !== "review" && (
          <div className="space-y-4">
            {capturedFrames.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {capturedFrames.map((frame) => (
                  <Badge key={frame.id} variant="default">
                    <span className="capitalize">{frame.angle}</span>
                  </Badge>
                ))}
                <span className="text-xs text-muted-foreground">
                  cut from your recording
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={!supported || !consent || busy}
                onClick={() => void start()}
              >
                {capturedFrames.length > 0 ? "Record again" : "Start recording"}
              </Button>
              {!consent && (
                <span className="text-xs text-muted-foreground">
                  Agree below before recording.
                </span>
              )}
            </div>

            {recording && (
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs font-medium text-foreground">
                  Your recording is stored
                  {recording.duration_seconds
                    ? ` (${recording.duration_seconds.toFixed(0)}s)`
                    : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Kept so your angles can be re-cut without filming again. Deleting it
                  leaves the frames above in place.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1.5 px-0 text-destructive"
                  disabled={busy}
                  onClick={() =>
                    void run(() => deleteAvatarRecording(), "Couldn't delete that recording")
                  }
                >
                  Delete recording
                </Button>
              </div>
            )}

            <label className="flex items-start gap-2.5 border-t border-border pt-4">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0"
                checked={consent}
                disabled={busy}
                onChange={(event) =>
                  void run(
                    () => (event.target.checked ? grantFaceConsent() : revokeFaceConsent()),
                    "Couldn't update that"
                  )
                }
              />
              <span className="text-xs text-foreground">
                I agree to my likeness being used to generate videos of me, and confirm
                this is me. The recording is stored so my angles can be re-cut, and I can
                delete it at any time.
              </span>
            </label>
          </div>
        )}

        {loading && !setup && <Skeleton className="h-10 w-full" />}
      </CardContent>
    </Card>
  );
}
